export const runtime = 'nodejs';

const OWNER = 'WealthStackerSystem';
const REPO = 'misfit-entrepreneur-site';
const BRANCH = 'main';
const DIR = 'images/cards';

const MAX_BYTES = 4 * 1024 * 1024;

type Body = {
  // base64 PNG without the data: prefix
  data: string;
  // used to build the filename, e.g. "ep-476-instagram-square"
  name: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 70);
}

export async function POST(req: Request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ ok: false, error: 'GITHUB_TOKEN is not set' }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.data || !body.name) {
    return Response.json({ ok: false, error: 'name and data are required' }, { status: 400 });
  }

  const approxBytes = Math.floor((body.data.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return Response.json(
      { ok: false, error: 'Image is too large at ' + Math.round(approxBytes / 1024) + 'KB' },
      { status: 400 }
    );
  }

  const slug = slugify(body.name);
  if (!slug) {
    return Response.json({ ok: false, error: 'Bad filename' }, { status: 400 });
  }

  const path = DIR + '/' + slug + '.png';
  const api = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;

  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'misfit-admin',
  };

  try {
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
      message: (sha ? 'Update' : 'Add') + ' card: ' + slug,
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
  });
}
