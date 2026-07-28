export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, stripFences } from '@/lib/anthropic';

type Body = {
  count?: number;
  platform?: 'x' | 'linkedin' | 'instagram';
  startDate?: string;
};

type EpisodeRow = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  key_theme: string | null;
  best_quote: string | null;
  slug: string | null;
};

// Hardcoded rather than living in the prompts table. Evergreen posts are a
// different job from launch week, and this one rarely needs tuning.
const SYSTEM = `You write evergreen social posts for The Misfit Entrepreneur, hosted by Dave Lukas.

These resurface older episodes. The reader has almost certainly never heard them, so nothing should sound like a repost or a throwback.

VOICE
Dave posting. Short sentences. Direct. States the interesting thing and lets it land.

NEVER
- "Throwback", "ICYMI", "from the archives", "one of my favourites"
- Hype words: incredible, amazing, must-listen, game-changing
- Emoji strings, or opening with "New episode"
- Inventing anything the guest did not say

RULE THAT MATTERS MOST
Lead with the idea, not the episode. The post has to be worth reading for someone who never clicks. Mention the episode at the end as where the idea came from.

Good shape: state a specific, slightly counterintuitive thing a real operator said or did, then attribute it and link.

PLATFORM
x - under 270 characters, no hashtags, url at the end
linkedin - 100 to 160 words, short paragraphs with line breaks, url at the end, no hashtags
instagram - 60 to 110 words, warmer, ends with "Link in bio" then exactly 3 hashtags including misfitentrepreneur

Return ONLY valid JSON, no fences, no preamble:
{"posts":[{"episode_number":123,"content":"..."}]}

One post per episode given, in the same order.`;

function pickSpread<T>(pool: T[], n: number): T[] {
  // Take from the longest-waiting half, at random, so the rotation does not
  // march predictably through the archive in order.
  const half = pool.slice(0, Math.max(n * 3, Math.min(pool.length, 24)));
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < half.length) {
    const i = Math.floor(Math.random() * half.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(half[i]);
  }
  return out;
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // defaults are fine
  }

  const count = Math.min(Math.max(body.count || 5, 1), 8);
  const platform = body.platform || 'x';
  const supabase = createAdminClient();

  const { data: pool } = await supabase
    .from('episodes')
    .select('id, episode_number, title, guest_name, key_theme, best_quote, slug')
    .gte('evergreen_score', 4)
    .not('key_theme', 'is', null)
    .order('last_promoted_at', { ascending: true, nullsFirst: true })
    .limit(60);

  const episodes = pickSpread((pool as EpisodeRow[]) || [], count);

  if (episodes.length === 0) {
    return Response.json(
      { ok: false, error: 'No evergreen episodes found. Run the Backfill tagging.' },
      { status: 400 }
    );
  }

  const listing = episodes
    .map((e) => {
      const url =
        'https://misfitentrepreneur.com/episodes/' +
        (e.slug || 'ep-' + e.episode_number + '-episode') +
        '.html';
      return (
        'Episode ' + e.episode_number + ': ' + (e.title || '') +
        (e.guest_name ? '\n  guest: ' + e.guest_name : '') +
        '\n  theme: ' + (e.key_theme || '') +
        (e.best_quote ? '\n  quote: ' + e.best_quote.slice(0, 200) : '') +
        '\n  url: ' + url
      );
    })
    .join('\n\n');

  let posts: { episode_number?: number; content?: string }[];

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        { role: 'user', content: 'PLATFORM: ' + platform + '\n\nEPISODES:\n\n' + listing },
      ],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    const parsed = JSON.parse(stripFences(text)) as {
      posts?: { episode_number?: number; content?: string }[];
    };
    posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 }
    );
  }

  const byNumber = new Map<number, EpisodeRow>();
  for (const e of episodes) byNumber.set(e.episode_number, e);

  // Space them out from the start date, one every three days
  const start = body.startDate
    ? new Date(body.startDate + 'T14:00:00Z')
    : new Date(Date.now() + 24 * 3600 * 1000);

  const rows: Record<string, unknown>[] = [];
  let slot = 0;

  for (const p of posts) {
    if (!p.content || typeof p.episode_number !== 'number') continue;
    const ep = byNumber.get(p.episode_number);
    if (!ep) continue;

    const when = new Date(start.getTime());
    when.setUTCDate(when.getUTCDate() + slot * 3);
    slot += 1;

    rows.push({
      episode_id: ep.id,
      platform: platform,
      content: p.content.trim(),
      scheduled_for: when.toISOString(),
      status: 'draft',
      source: 'evergreen',
    });
  }

  if (rows.length === 0) {
    return Response.json(
      { ok: false, error: 'Nothing usable came back. Try again.' },
      { status: 502 }
    );
  }

  const { error: insErr } = await supabase.from('social_posts').insert(rows);

  if (insErr) {
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  // Mark them promoted so the rotation moves on. This is the only place
  // last_promoted_at gets stamped today.
  const ids = rows.map((r) => r.episode_id as string);
  await supabase
    .from('episodes')
    .update({ last_promoted_at: new Date().toISOString() })
    .in('id', ids);

  return Response.json({
    ok: true,
    count: rows.length,
    episodes: Array.from(byNumber.keys()),
  });
}
