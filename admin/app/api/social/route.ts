export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate, stripFences } from '@/lib/anthropic';

type Body = {
  episodeId: string;
  platform: 'x' | 'linkedin' | 'instagram';
};

type GeneratedPost = {
  day?: number;
  content?: string;
};

/**
 * Release day plus an offset, at a sensible hour. Buffer and GHL both take
 * an ISO timestamp, so the scheduling decision is made once here rather
 * than being left to whoever pastes the post.
 */
function scheduleFor(releaseDate: string | null, dayOffset: number): string | null {
  if (!releaseDate) return null;
  const base = new Date(releaseDate + 'T13:00:00Z');
  if (isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString();
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const platform = body.platform;
  if (['x', 'linkedin', 'instagram'].indexOf(platform) === -1) {
    return Response.json({ ok: false, error: 'Unknown platform' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', body.episodeId)
    .single();

  if (epErr || !ep) {
    return Response.json({ ok: false, error: 'Episode not found' }, { status: 404 });
  }

  const { data: assetRows } = await supabase
    .from('episode_assets')
    .select('asset_type, content')
    .eq('episode_id', body.episodeId)
    .eq('is_current', true);

  const assets: Record<string, string> = {};
  if (assetRows) {
    for (const r of assetRows) {
      if (r.content && r.asset_type !== 'show_notes_html') {
        assets[r.asset_type] = r.content;
      }
    }
  }

  if (!assets.show_notes_meta) {
    return Response.json(
      { ok: false, error: 'Generate the show notes first.' },
      { status: 400 }
    );
  }

  const { data: prompt } = await supabase
    .from('prompts')
    .select('system_prompt, user_template, model, max_tokens')
    .eq('asset_type', 'social_x')
    .eq('is_active', true)
    .single();

  if (!prompt) {
    return Response.json(
      { ok: false, error: 'No active social prompt found.' },
      { status: 400 }
    );
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

  let posts: GeneratedPost[];

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

    const parsed = JSON.parse(stripFences(text)) as { posts?: GeneratedPost[] };
    posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 }
    );
  }

  if (posts.length === 0) {
    return Response.json(
      { ok: false, error: 'No posts came back. Try again.' },
      { status: 502 }
    );
  }

  // Regenerating replaces this platform's posts rather than piling up
  // duplicates. Approved posts are left alone so an accidental rerun
  // cannot wipe something already scheduled.
  await supabase
    .from('social_posts')
    .delete()
    .eq('episode_id', body.episodeId)
    .eq('platform', platform)
    .neq('status', 'approved');

  const rows = posts
    .filter((p) => typeof p.content === 'string' && p.content.trim().length > 0)
    .map((p) => ({
      episode_id: body.episodeId,
      platform: platform,
      content: (p.content || '').trim(),
      day_offset: typeof p.day === 'number' ? p.day : 0,
      scheduled_for: scheduleFor(ep.release_date, typeof p.day === 'number' ? p.day : 0),
      status: 'draft',
      source: 'new_episode',
    }));

  const { error: insErr } = await supabase.from('social_posts').insert(rows);

  if (insErr) {
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, platform: platform, count: rows.length });
}
