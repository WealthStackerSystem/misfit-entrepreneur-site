export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { buildBlogHtml, humanDate } from '@/lib/blog-template';

const OWNER = 'WealthStackerSystem';
const REPO = 'misfit-entrepreneur-site';
const BRANCH = 'main';
const INDEX_PATH = 'blog_index.json';

type Body = { articleId: string };

type IndexEntry = {
  slug: string;
  title: string;
  date: string;
  pub: string;
};

function ghHeaders(token: string) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'misfit-admin',
  };
}

function contentsUrl(path: string) {
  return 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;
}

async function readFile(token: string, path: string) {
  const res = await fetch(contentsUrl(path) + '?ref=' + BRANCH, {
    headers: ghHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('GitHub read failed on ' + path + ' (' + res.status + ')');
  }
  const json = await res.json();
  return {
    sha: json.sha as string,
    text: json.content
      ? Buffer.from(json.content, 'base64').toString('utf8')
      : '',
  };
}

async function writeFile(
  token: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<string> {
  const payload: Record<string, unknown> = {
    message: message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;

  const res = await fetch(contentsUrl(path), {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub write failed on ' + path + ' (' + res.status + '): ' + err);
  }

  const result = await res.json();
  return result?.commit?.sha || '';
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

  const supabase = createAdminClient();

  const { data: post, error: selErr } = await supabase
    .from('articles')
    .select('*')
    .eq('id', body.articleId)
    .single();

  if (selErr || !post) {
    return Response.json({ ok: false, error: 'Article not found' }, { status: 404 });
  }

  if (!post.body_html || post.body_html.trim().length === 0) {
    return Response.json(
      { ok: false, error: 'This post has no body yet.' },
      { status: 400 }
    );
  }

  // Publishing sets the date if it does not have one
  const publishDate =
    post.publish_date || new Date().toISOString().slice(0, 10);

  const html = buildBlogHtml({
    slug: post.slug,
    title: post.title,
    body_html: post.body_html,
    meta_description: post.meta_description,
    publish_date: publishDate,
  });

  const path = 'blog/' + post.slug + '.html';

  let commitSha = '';
  let action = 'created';
  let indexAction = 'unchanged';

  try {
    const existing = await readFile(token, path);
    action = existing ? 'updated' : 'created';

    commitSha = await writeFile(
      token,
      path,
      html,
      (existing ? 'Update' : 'Add') + ' blog post: ' + post.title,
      existing ? existing.sha : undefined
    );

    // blog.html reads this file to build the listing. Without an entry the
    // post exists but nothing links to it.
    const idxFile = await readFile(token, INDEX_PATH);

    if (idxFile) {
      let index: IndexEntry[] = [];
      try {
        const parsed = JSON.parse(idxFile.text);
        if (Array.isArray(parsed)) index = parsed as IndexEntry[];
      } catch {
        throw new Error('blog_index.json is not valid JSON.');
      }

      const entry: IndexEntry = {
        slug: post.slug,
        title: post.title,
        date: humanDate(publishDate),
        pub: new Date(publishDate + 'T12:00:00Z').toUTCString(),
      };

      const at = index.findIndex((e) => e.slug === post.slug);

      if (at === -1) {
        index.unshift(entry);
        indexAction = 'added';
      } else if (
        index[at].title !== entry.title ||
        index[at].date !== entry.date
      ) {
        index[at] = entry;
        indexAction = 'updated';
      }

      if (indexAction !== 'unchanged') {
        await writeFile(
          token,
          INDEX_PATH,
          JSON.stringify(index, null, 1) + '\n',
          'Index blog post: ' + post.title,
          idxFile.sha
        );
      }
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Publish failed' },
      { status: 502 }
    );
  }

  await supabase
    .from('articles')
    .update({
      status: 'published',
      publish_date: publishDate,
      published_at: new Date().toISOString(),
    })
    .eq('id', body.articleId);

  return Response.json({
    ok: true,
    url: 'https://misfitentrepreneur.com/' + path,
    action: action,
    index: indexAction,
    commit: commitSha,
  });
}
