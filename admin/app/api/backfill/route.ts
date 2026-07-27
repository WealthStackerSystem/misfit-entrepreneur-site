export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, stripFences } from '@/lib/anthropic';

type Body = {
  batchSize?: number;
};

type EpisodeRow = {
  id: string;
  episode_number: number;
  title: string | null;
  best_quote: string | null;
};

type TagResult = {
  episode_number: number;
  guest_name: string | null;
  topics: string[];
  evergreen_score: number;
  key_theme: string;
};

// Netlify functions are killed at roughly 26 seconds. This call does not
// stream, so nothing returns until the whole batch is written. Keep the
// batch small enough that a slow response still lands in time.
const DEFAULT_BATCH = 8;
const MAX_BATCH = 12;

const SYSTEM_PROMPT = `You catalogue the archive of The Misfit Entrepreneur, a podcast hosted by Dave Lukas featuring interviews with entrepreneurs.

For each episode you get a number, a title, and sometimes a quote. Return metadata.

guest_name
  The guest's full name if it appears in the title. Titles read like "... with Jane Doe" or "... how Jane Doe built X". Extract the PERSON, never a company. Dave Lukas is the host and is never the guest. Solo episodes return null. No identifiable person returns null.

topics
  4 to 6 lowercase tags. Short noun phrases someone would search for. Reuse the same tags across episodes rather than inventing new ones. Good: "sales", "hiring", "mindset", "acquisitions", "real estate", "scaling". Bad: "the power of belief", "an amazing journey".

evergreen_score
  Integer 1 to 5. How well does this hold up years later?
  5 timeless principles, 4 mostly timeless, 3 somewhat tied to its moment, 2 noticeably dated, 1 tied to a specific event or news cycle.
  Mindset, sales, leadership and fundamentals score high. A specific platform, tool, current event or year-in-review scores low.

key_theme
  One sentence under 90 characters naming what the episode is actually about. Plain, no hype.

Return ONLY a valid JSON array, one object per episode, same order given. No markdown fences, no preamble. Be terse.

[{"episode_number":123,"guest_name":"...","topics":["..."],"evergreen_score":4,"key_theme":"..."}]`;

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is fine
  }

  const batchSize = Math.min(Math.max(body.batchSize || DEFAULT_BATCH, 1), MAX_BATCH);
  const supabase = createAdminClient();

  const { data: rows, error: selErr } = await supabase
    .from('episodes')
    .select('id, episode_number, title, best_quote')
    .is('key_theme', null)
    .not('title', 'is', null)
    .order('episode_number', { ascending: false })
    .limit(batchSize);

  if (selErr) {
    return Response.json({ ok: false, error: selErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return Response.json({
      ok: true,
      done: true,
      tagged: 0,
      remaining: 0,
      message: 'All episodes are tagged.',
    });
  }

  const episodes = rows as EpisodeRow[];

  const listing = episodes
    .map((e) => {
      const q = e.best_quote ? '\n   quote: ' + e.best_quote.slice(0, 160) : '';
      return e.episode_number + '. ' + (e.title || '') + q;
    })
    .join('\n');

  let parsed: TagResult[];

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'EPISODES:\n\n' + listing }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    parsed = JSON.parse(stripFences(text)) as TagResult[];

    if (!Array.isArray(parsed)) {
      throw new Error('Model did not return an array');
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Tagging failed' },
      { status: 502 }
    );
  }

  // Match results back by episode number so order drift cannot corrupt data
  const byNumber = new Map<number, TagResult>();
  for (const r of parsed) {
    if (typeof r.episode_number === 'number') {
      byNumber.set(r.episode_number, r);
    }
  }

  let updated = 0;
  const failures: number[] = [];

  for (const ep of episodes) {
    const r = byNumber.get(ep.episode_number);

    if (!r) {
      failures.push(ep.episode_number);
      continue;
    }

    const score =
      typeof r.evergreen_score === 'number' &&
      r.evergreen_score >= 1 &&
      r.evergreen_score <= 5
        ? Math.round(r.evergreen_score)
        : 3;

    const topics = Array.isArray(r.topics)
      ? r.topics
          .filter((t) => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.toLowerCase().trim())
          .slice(0, 8)
      : [];

    const theme =
      typeof r.key_theme === 'string' && r.key_theme.trim().length > 0
        ? r.key_theme.trim().slice(0, 200)
        : 'Untagged';

    const patch: Record<string, unknown> = {
      topics: topics,
      evergreen_score: score,
      key_theme: theme,
    };

    if (r.guest_name && typeof r.guest_name === 'string' && r.guest_name.trim().length > 0) {
      const g = r.guest_name.trim();
      if (g.toLowerCase() !== 'dave lukas' && g.toLowerCase() !== 'null') {
        patch.guest_name = g;
      }
    }

    const { error: upErr } = await supabase
      .from('episodes')
      .update(patch)
      .eq('id', ep.id);

    if (upErr) {
      failures.push(ep.episode_number);
    } else {
      updated += 1;
    }
  }

  const { count: remaining } = await supabase
    .from('episodes')
    .select('*', { count: 'exact', head: true })
    .is('key_theme', null)
    .not('title', 'is', null);

  return Response.json({
    ok: true,
    done: (remaining ?? 0) === 0,
    tagged: updated,
    failed: failures,
    remaining: remaining ?? 0,
  });
}
