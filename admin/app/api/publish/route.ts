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

type Body = {
  episodeId: string;
};

type GitHubFileResponse = {
  sha?: string;
  content?: string;
  message?: string;
};

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

  // Guard against publishing a half-generated page
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
  const { data: sp } = await supabase
    .from('sponsors')
    .select('name, tier, shownotes_copy, offer_url, url')
    .eq('active', true);

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
    sp
      ? (sp as {
          name: string;
          tier: string | null;
          shownotes_copy: string | null;
          offer_url: string | null;
          url: string | null;
        }[])
      : [],
    ep.transcript || ''
  );

  const path = 'episodes/ep-' + ep.episode_number + '-episode.html';
  const apiBase = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;

  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'misfit-admin',
  };

  // --- Get the existing file SHA, if the file exists -----------------
  let sha: string | undefined = undefined;

  try {
    const getRes = await fetch(apiBase + '?ref=' + BRANCH, { headers });
    if (getRes.ok) {
      const existing = (await getRes.json()) as GitHubFileResponse;
      sha = existing.sha;
    } else if (getRes.status !== 404) {
      const errText = await getRes.text();
      return Response.json(
        { ok: false, error: 'GitHub read failed (' + getRes.status + '): ' + errText },
        { status: 502 }
      );
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'GitHub read failed' },
      { status: 502 }
    );
  }

  // --- Commit --------------------------------------------------------
  const commitMessage =
    (sha ? 'Update' : 'Add') +
    ' show notes for episode ' +
    ep.episode_number +
    (ep.title ? ': ' + ep.title : '');

  const payload: Record<string, unknown> = {
    message: commitMessage,
    content: Buffer.from(html, 'utf8').toString('base64'),
    branch: BRANCH,
  };

  if (sha) payload.sha = sha;

  let commitSha = '';

  try {
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return Response.json(
        { ok: false, error: 'GitHub commit failed (' + putRes.status + '): ' + errText },
        { status: 502 }
      );
    }

    const result = await putRes.json();
    commitSha = result?.commit?.sha || '';
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'GitHub commit failed' },
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
    action: sha ? 'updated' : 'created',
    bytes: html.length,
  });
}
