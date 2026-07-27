export const runtime = 'nodejs';

const OWNER = 'WealthStackerSystem';
const REPO = 'misfit-entrepreneur-site';
const BRANCH = 'main';
const DIR = 'images/sponsors';

// Netlify caps the request body, and a logo has no business being large.
const MAX_BYTES = 2 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

type Body = {
  name: string;
  mimeType: string;
  // base64 without the data: prefix
  data: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: 'GITHUB_TOKEN is not set' },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.data || !body.mimeType) {
    return Response.json(
      { ok: false, error: 'name, mimeType and data are required' },
      { status: 400 }
    );
  }

  const ext = EXT[body.mimeType.toLowerCase()];
  if (!ext) {
    return Response.json(
      { ok: false, error: 'Unsupported file type. Use JPG, PNG, WEBP or SVG.' },
      { status: 400 }
    );
  }

  // base64 inflates by about a third
  const approxBytes = Math.floor((body.data.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return Response.json(
      {
        ok: false,
        error:
          'File is about ' +
          Math.round(approxBytes / 1024) +
          'KB. Keep logos under 2MB.',
      },
      { status: 400 }
    );
  }

  const slug = slugify(body.name);
  if (!slug) {
    return Response.json(
      { ok: false, error: 'Could not build a filename from that sponsor name' },
      { status: 400 }
    );
  }

  const path = DIR + '/' + slug + '.' + ext;
  const api =
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;

  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'misfit-admin',
  };

  try {
    // Replacing an existing logo needs its sha
    let sha: string | undefined = undefined;
    const check = await fetch(api + '?ref=' + BRANCH, { headers });
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    } else if (check.status !== 404) {
      const err = await check.text();
      return Response.json(
        { ok: false, error: 'GitHub read failed (' + check.status + '): ' + err },
        { status: 502 }
      );
    }

    const payload: Record<string, unknown> = {
      message: (sha ? 'Update' : 'Add') + ' sponsor logo: ' + body.name,
      content: body.data,
      branch: BRANCH,
    };
    if (sha) payload.sha = sha;

    const put = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!put.ok) {
      const err = await put.text();
      return Response.json(
        { ok: false, error: 'Upload failed (' + put.status + '): ' + err },
        { status: 502 }
      );
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    url: 'https://misfitentrepreneur.com/' + path,
    path: path,
    replaced: false,
  });
}
