export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate, stripFences } from '@/lib/anthropic';

type Body = {
  mode: 'topic' | 'thesis' | 'source';
  input: string;
  sourceUrl?: string;
  sourceText?: string;
};

type EpisodeRow = {
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  key_theme: string | null;
  topics: string[] | null;
  slug: string | null;
};

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'you', 'are',
  'but', 'not', 'they', 'have', 'has', 'was', 'were', 'been', 'what', 'when',
  'how', 'why', 'who', 'about', 'into', 'more', 'most', 'than', 'then', 'them',
  'their', 'there', 'these', 'those', 'will', 'would', 'should', 'could',
  'can', 'its', 'it', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'be', 'as',
  'at', 'by', 'or', 'if', 'so', 'do', 'does', 'did', 'get', 'got', 'make',
  'made', 'one', 'two', 'out', 'up', 'my', 'me', 'we', 'our', 'us', 'i',
]);

function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  const counts = new Map<string, number>();
  for (const w of words) {
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map((e) => e[0]);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.input || body.input.trim().length < 5) {
    return Response.json(
      { ok: false, error: 'Say a bit more about what the post should cover.' },
      { status: 400 }
    );
  }

  const mode = body.mode || 'topic';
  const supabase = createAdminClient();

  // --- Candidate episodes -------------------------------------------
  // Match on the topic tags first. The archive tagging exists for exactly
  // this, and it is what lets a post link to real episodes instead of
  // generic filler.
  const kws = keywords(body.input + ' ' + (body.sourceText || ''));

  let candidates: EpisodeRow[] = [];

  if (kws.length > 0) {
    const { data } = await supabase
      .from('episodes')
      .select('episode_number, title, guest_name, key_theme, topics, slug')
      .overlaps('topics', kws)
      .gte('evergreen_score', 3)
      .limit(14);
    candidates = (data as EpisodeRow[]) || [];
  }

  // Nothing matched, so offer the strongest evergreen episodes instead
  if (candidates.length < 4) {
    const { data } = await supabase
      .from('episodes')
      .select('episode_number, title, guest_name, key_theme, topics, slug')
      .gte('evergreen_score', 5)
      .not('key_theme', 'is', null)
      .limit(12);

    const extra = (data as EpisodeRow[]) || [];
    const seen = new Set(candidates.map((c) => c.episode_number));
    for (const e of extra) {
      if (!seen.has(e.episode_number)) candidates.push(e);
    }
  }

  const episodeBlock = candidates
    .slice(0, 16)
    .map((e) => {
      const url =
        'https://misfitentrepreneur.com/episodes/' +
        (e.slug || 'ep-' + e.episode_number + '-episode') +
        '.html';
      return (
        'Episode ' + e.episode_number + ': ' + (e.title || '') +
        (e.guest_name ? ' (guest: ' + e.guest_name + ')' : '') +
        '\n  ' + (e.key_theme || '') +
        '\n  url: ' + url
      );
    })
    .join('\n\n');

  // --- Voice references ----------------------------------------------
  const { data: refs } = await supabase
    .from('articles')
    .select('title, body_html, word_count')
    .eq('is_style_reference', true)
    .order('word_count', { ascending: true })
    .limit(4);

  const voiceBlock = ((refs as { title: string; body_html: string }[]) || [])
    .map((r) => {
      const plain = (r.body_html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return '--- ' + r.title + ' ---\n' + plain.slice(0, 3500);
    })
    .join('\n\n');

  // --- Source block ----------------------------------------------------
  let sourceBlock = '';
  if (mode === 'source') {
    sourceBlock =
      'SOURCE ARTICLE' +
      (body.sourceUrl ? '\nURL: ' + body.sourceUrl : '') +
      '\n' + (body.sourceText || '').slice(0, 20000);
  }

  // --- Prompt ----------------------------------------------------------
  const { data: prompt } = await supabase
    .from('prompts')
    .select('system_prompt, user_template, model, max_tokens')
    .eq('asset_type', 'blog_post')
    .eq('is_active', true)
    .single();

  if (!prompt) {
    return Response.json(
      { ok: false, error: 'No active blog_post prompt found.' },
      { status: 400 }
    );
  }

  const userMessage = fillTemplate(prompt.user_template, {
    mode: mode,
    input: body.input,
    source_block: sourceBlock,
    episodes: episodeBlock || 'None available.',
    voice: voiceBlock || 'None available.',
  });

  let parsed: Record<string, unknown>;

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: prompt.model || 'claude-sonnet-4-6',
      max_tokens: prompt.max_tokens || 4000,
      system: prompt.system_prompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 }
    );
  }

  // --- Save as a draft article ------------------------------------------
  const titles = Array.isArray(parsed.title_options)
    ? (parsed.title_options as string[])
    : [];
  const title = titles.length > 0 ? titles[0] : 'Untitled';

  let slug =
    typeof parsed.slug === 'string' && parsed.slug.trim().length > 0
      ? parsed.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
      : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/^-+/, '').replace(/-+$/, '').slice(0, 80);

  // A slug collision would overwrite a real post, so make it unique
  const { data: clash } = await supabase
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (clash && clash.length > 0) {
    slug = slug.slice(0, 70) + '-' + Date.now().toString().slice(-5);
  }

  const bodyHtml = typeof parsed.body_html === 'string' ? parsed.body_html : '';
  const plain = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const { data: inserted, error: insErr } = await supabase
    .from('articles')
    .insert({
      slug: slug,
      title: title,
      body_html: bodyHtml,
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : null,
      meta_description:
        typeof parsed.meta_description === 'string' ? parsed.meta_description : null,
      word_count: plain.split(/\s+/).filter(Boolean).length,
      status: 'draft',
      source: 'generated',
      title_options: titles,
      episodes_linked: Array.isArray(parsed.episodes_linked)
        ? parsed.episodes_linked
        : [],
    })
    .select('id')
    .single();

  if (insErr) {
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    id: inserted?.id,
    slug: slug,
    title: title,
    words: plain.split(/\s+/).filter(Boolean).length,
    candidates: candidates.length,
  });
}
