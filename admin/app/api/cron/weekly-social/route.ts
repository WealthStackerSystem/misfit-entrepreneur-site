export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate, stripFences } from '@/lib/anthropic';

/**
 * Runs Monday morning, once per platform, five minutes apart.
 * Each call is its own request so none of them runs up against the
 * function time limit.
 *
 *   /api/cron/weekly-social?secret=...&platform=x
 *   /api/cron/weekly-social?secret=...&platform=linkedin
 *   /api/cron/weekly-social?secret=...&platform=instagram
 *
 * Finds the episode releasing this week, writes the posts, and spreads
 * them across the seven days from release. Everything lands as a draft.
 */

type EpisodeRow = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
  release_date: string | null;
  best_quote: string | null;
};

// Days after release for each platform, so the week has a rhythm rather
// than everything firing on Wednesday.
const DAY_PLAN: Record<string, number[]> = {
  x: [0, 1, 3, 5],
  linkedin: [0, 3],
  instagram: [0, 2],
};

function scheduleFor(releaseDate: string | null, offset: number): string | null {
  if (!releaseDate) return null;
  const d = new Date(releaseDate + 'T13:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const platform = url.searchParams.get('platform') || 'x';

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (['x', 'linkedin', 'instagram'].indexOf(platform) === -1) {
    return Response.json({ ok: false, error: 'Unknown platform' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // The episode releasing in the next week, or the one just out. Running on
  // Monday for a Wednesday release means looking slightly forward.
  const today = new Date();
  const from = new Date(today.getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 9 * 86400000).toISOString().slice(0, 10);

  const { data: eps } = await supabase
    .from('episodes')
    .select('id, episode_number, title, guest_name, guest_company, release_date, best_quote')
    .gte('release_date', from)
    .lte('release_date', to)
    .not('title', 'is', null)
    .order('release_date', { ascending: true })
    .limit(1);

  const ep = ((eps as EpisodeRow[]) || [])[0];

  if (!ep) {
    return Response.json({
      ok: true,
      skipped: 'No episode releasing between ' + from + ' and ' + to,
    });
  }

  // Never write over a week that has already been reviewed
  const { data: existing } = await supabase
    .from('social_posts')
    .select('id, status')
    .eq('episode_id', ep.id)
    .eq('platform', platform);

  const rows = (existing as { id: string; status: string }[]) || [];
  if (rows.some((r) => r.status === 'approved')) {
    return Response.json({
      ok: true,
      skipped: 'Approved posts already exist for episode ' + ep.episode_number,
    });
  }

  const { data: assetRows } = await supabase
    .from('episode_assets')
    .select('asset_type, content')
    .eq('episode_id', ep.id)
    .eq('is_current', true);

  const assets: Record<string, string> = {};
  for (const r of (assetRows as { asset_type: string; content: string | null }[]) || []) {
    if (r.content && r.asset_type !== 'show_notes_html') assets[r.asset_type] = r.content;
  }

  if (!assets.show_notes_meta) {
    return Response.json({
      ok: true,
      skipped: 'Episode ' + ep.episode_number + ' has no show notes yet',
    });
  }

  const { data: prompt } = await supabase
    .from('prompts')
    .select('system_prompt, user_template, model')
    .eq('asset_type', 'social_x')
    .eq('is_active', true)
    .single();

  if (!prompt) {
    return Response.json({ ok: false, error: 'No active social prompt' }, { status: 400 });
  }

  const episodeUrl =
    'https://misfitentrepreneur.com/episodes/ep-' + ep.episode_number + '-episode.html';

  const userMessage = fillTemplate(prompt.user_template, {
    platform: platform,
    guest_name: ep.guest_name || '',
    guest_company: ep.guest_company || '',
    episode_number: String(ep.episode_number),
    title: ep.title || '',
    episode_url: episodeUrl,
    show_notes_meta: assets.show_notes_meta || '',
    show_notes_extras: assets.show_notes_extras || '',
    show_notes_sections_a: assets.show_notes_sections_a || '',
  });

  let posts: { day?: number; content?: string }[];

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: prompt.model || 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: prompt.system_prompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    const parsed = JSON.parse(stripFences(text)) as { posts?: { day?: number; content?: string }[] };
    posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 }
    );
  }

  if (posts.length === 0) {
    return Response.json({ ok: false, error: 'Nothing generated' }, { status: 502 });
  }

  await supabase
    .from('social_posts')
    .delete()
    .eq('episode_id', ep.id)
    .eq('platform', platform)
    .neq('status', 'approved');

  const plan = DAY_PLAN[platform] || [0];

  // Pull a quote for the Instagram card. Generated extras first, then the
  // quote stored on the episode itself for back catalogue.
  let cardQuote: string | null = ep.best_quote;
  if (assets.show_notes_extras) {
    try {
      const extras = JSON.parse(stripFences(assets.show_notes_extras));
      if (typeof extras.best_quote === 'string') cardQuote = extras.best_quote;
    } catch {
      // keep whatever we had
    }
  }

  const inserts = posts
    .filter((p) => typeof p.content === 'string' && p.content.trim().length > 0)
    .map((p, i) => {
      const offset =
        typeof p.day === 'number' ? p.day : plan[i] !== undefined ? plan[i] : i;
      return {
        episode_id: ep.id,
        platform: platform,
        content: (p.content || '').trim(),
        day_offset: offset,
        scheduled_for: scheduleFor(ep.release_date, offset),
        status: 'draft',
        source: 'new_episode',
        card_quote: platform === 'instagram' ? cardQuote : null,
      };
    });

  const { error: insErr } = await supabase.from('social_posts').insert(inserts);

  if (insErr) {
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    episode: ep.episode_number,
    platform: platform,
    created: inserts.length,
  });
}
