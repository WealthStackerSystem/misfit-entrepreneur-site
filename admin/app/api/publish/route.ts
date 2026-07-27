export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import {
  buildShowNotesHtml,
  type ShowNotesData,
  type Section,
} from '@/lib/shownotes-template';
import { stripFences } from '@/lib/anthropic';

const OWNER = 'WealthStackerSystem';
const REPO = 'misfit-entrepreneur-site';
const BRANCH = 'main';
const INDEX_PATH = 'episode_index.json';

type Body = {
  episodeId: string;
};

type IndexEntry = {
  num: string;
  title: string;
  slug: string;
  guest: string;
};

type GitHubFile = {
  sha?: string;
  content?: string;
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

/**
 * Read a file from GitHub. Returns null if it does not exist.
 */
async function readFile(
  token: string,
  path: string
): Promise<{ sha: string; text: string } | null> {
  const res = await fetch(contentsUrl(path) + '?ref=' + BRANCH, {
    headers: ghHeaders(token),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub read failed on ' + path + ' (' + res.status + '): ' + err);
  }

  const json = (await res.json()) as GitHubFile;
  const text = json.content
    ? Buffer.from(json.content, 'base64').toString('utf8')
    : '';

  return { sha: json.sha || '', text: text };
}

/**
 * Create or update a file on GitHub. Returns the commit sha.
 */
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
    return Response.json(
      { ok: false, error: 'GITHUB_TOKEN is not set in environment variables' },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.episodeId) {
    return Response.json({ ok: false, error: 'episodeId is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // --- Load episode -------------------------------------------------
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', body.episodeId)
    .single();

  if (epErr || !ep) {
    return Response.json({ ok: false, error: 'Episode not found' }, { status: 404 });
  }

  // --- Load and merge generated assets ------------------------------
  const { data: rows } = await supabase
    .from('episode_assets')
    .select('asset_type, content')
    .eq('episode_id', body.episodeId)
    .eq('is_current', true);

  if (!rows || rows.length === 0) {
    return Response.json(
      { ok: false, error: 'No generated assets. Run the show notes generator first.' },
      { status: 400 }
    );
  }

  const merged: ShowNotesData = {};
  let sections: Section[] = [];
  const seen: string[] = [];

  for (const r of rows) {
    if (!r.content) continue;
    if (r.asset_type.indexOf('show_notes_') !== 0) continue;
    if (r.asset_type === 'show_notes_html') continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stripFences(r.content));
    } catch {
      return Response.json(
        { ok: false, error: 'Could not parse ' + r.asset_type + '. Regenerate that step.' },
        { status: 400 }
      );
    }

    seen.push(r.asset_type);

    if (Array.isArray(parsed.sections)) {
      sections = sections.concat(parsed.sections as Section[]);
    }

    Object.keys(parsed).forEach((k) => {
      if (k !== 'sections') {
        (merged as Record<string, unknown>)[k] = parsed[k];
      }
    });
  }

  merged.sections = sections;

  const required = [
    'show_notes_meta',
    'show_notes_sections_a',
    'show_notes_sections_b',
    'show_notes_extras',
  ];
  const missing = required.filter((r) => seen.indexOf(r) === -1);
  if (missing.length > 0) {
    return Response.json(
      { ok: false, error: 'Missing generated assets: ' + missing.join(', ') },
      { status: 400 }
    );
  }

  // --- Sponsors -----------------------------------------------------
  // Use the sponsors picked for this episode. If none have been picked,
  // fall back to every active sponsor so an episode never publishes with
  // an empty sponsor block by accident.
  type SponsorRow = {
    name: string;
    tier: string | null;
    slot: string | null;
    shownotes_copy: string | null;
    offer_url: string | null;
    url: string | null;
    logo_url: string | null;
  };

  let sponsorList: SponsorRow[] = [];

  const { data: picked } = await supabase
    .from('episode_sponsors')
    .select('slot, position, sponsors(name, tier, shownotes_copy, offer_url, url, logo_url)')
    .eq('episode_id', body.episodeId)
    .order('position');

  if (picked && picked.length > 0) {
    for (const row of picked as unknown as {
      slot: string | null;
      sponsors: Omit<SponsorRow, 'slot'> | null;
    }[]) {
      if (!row.sponsors) continue;
      sponsorList.push({
        name: row.sponsors.name,
        tier: row.sponsors.tier,
        slot: row.slot,
        shownotes_copy: row.sponsors.shownotes_copy,
        offer_url: row.sponsors.offer_url,
        url: row.sponsors.url,
        logo_url: row.sponsors.logo_url,
      });
    }
  }

  if (sponsorList.length === 0) {
    const { data: sp } = await supabase
      .from('sponsors')
      .select('name, tier, slot, shownotes_copy, offer_url, url, logo_url')
      .eq('active', true);
    sponsorList = (sp as SponsorRow[]) || [];
  }

  // --- Build the page ------------------------------------------------
  const html = buildShowNotesHtml(
    merged,
    {
      episode_number: ep.episode_number,
      title: ep.title,
      guest_name: ep.guest_name,
      guest_company: ep.guest_company,
      release_date: ep.release_date,
      libsyn_player_embed: ep.libsyn_player_embed,
      guest_links: ep.guest_links,
    },
    sponsorList,
    ep.transcript || ''
  );

  const slug = 'ep-' + ep.episode_number + '-episode';
  const path = 'episodes/' + slug + '.html';
  const pageTitle = ep.title || merged.recommended_title || 'Untitled Episode';

  let pageAction = 'created';
  let commitSha = '';
  let indexAction = 'unchanged';

  try {
    // --- Commit the show notes page ---------------------------------
    const existing = await readFile(token, path);
    pageAction = existing ? 'updated' : 'created';

    const commitMessage =
      (existing ? 'Update' : 'Add') +
      ' show notes for episode ' +
      ep.episode_number +
      (ep.title ? ': ' + ep.title : '');

    commitSha = await writeFile(
      token,
      path,
      html,
      commitMessage,
      existing ? existing.sha : undefined
    );

    // --- Update episode_index.json ----------------------------------
    // The public podcast page reads this file to decide whether an
    // episode has a show notes page. Without an entry here, the page
    // exists but nothing links to it.
    const idxFile = await readFile(token, INDEX_PATH);

    if (idxFile) {
      let index: IndexEntry[] = [];
      try {
        const parsed = JSON.parse(idxFile.text);
        if (Array.isArray(parsed)) index = parsed as IndexEntry[];
      } catch {
        throw new Error('episode_index.json is not valid JSON. Fix it before publishing.');
      }

      const numStr = String(ep.episode_number);
      const entry: IndexEntry = {
        num: numStr,
        title: numStr + ': ' + pageTitle,
        slug: slug,
        guest: ep.guest_name || '',
      };

      const at = index.findIndex((e) => String(e.num) === numStr);

      if (at === -1) {
        // Newest first, matching the existing file order
        index.unshift(entry);
        indexAction = 'added';
      } else if (
        index[at].slug !== entry.slug ||
        index[at].title !== entry.title ||
        index[at].guest !== entry.guest
      ) {
        index[at] = entry;
        indexAction = 'updated';
      }

      if (indexAction !== 'unchanged') {
        await writeFile(
          token,
          INDEX_PATH,
          JSON.stringify(index, null, 2) + '\n',
          'Index episode ' + ep.episode_number,
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

  // --- Store the exact HTML that went live ---------------------------
  await supabase
    .from('episode_assets')
    .update({ is_current: false })
    .eq('episode_id', body.episodeId)
    .eq('asset_type', 'show_notes_html')
    .eq('is_current', true);

  const { data: prev } = await supabase
    .from('episode_assets')
    .select('version')
    .eq('episode_id', body.episodeId)
    .eq('asset_type', 'show_notes_html')
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = prev && prev.length > 0 ? prev[0].version + 1 : 1;

  await supabase.from('episode_assets').insert({
    episode_id: body.episodeId,
    asset_type: 'show_notes_html',
    content: html,
    version: nextVersion,
    is_current: true,
  });

  await supabase
    .from('episodes')
    .update({
      status: 'scheduled',
      site_url: 'https://misfitentrepreneur.com/' + path,
    })
    .eq('id', body.episodeId);

  return Response.json({
    ok: true,
    path: path,
    url: 'https://misfitentrepreneur.com/' + path,
    commit: commitSha,
    action: pageAction,
    index: indexAction,
    bytes: html.length,
  });
}
