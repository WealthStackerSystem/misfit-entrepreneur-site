export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate, stripFences } from '@/lib/anthropic';

type Body = {
  step?: 'body' | 'meta';
  mode: 'topic' | 'thesis' | 'source';
  input: string;
  sourceUrl?: string;
  sourceText?: string;
  articleId?: string;
};

// Deriving the title and metadata from a finished post is mechanical, so it
// lives here rather than in the prompts table where it would just be one more
// thing to keep in sync.
const META_SYSTEM = `You are given a finished blog post by Dave Lukas of The Misfit Entrepreneur.

Produce metadata for it. Do not rewrite the post.

title_options - 4 titles under 70 characters. Concrete, no colons unless the post earns one, no "The Ultimate Guide". Dave's titles name the idea plainly.
slug - lowercase hyphenated, from the strongest title, under 60 characters.
meta_description - under 155 characters, describes the actual argument.
excerpt - the first two sentences of the post, plain text, no tags.
episodes_linked - the episode numbers referenced in the body as an array of integers. Empty array if none.

Return ONLY valid JSON, no fences, no preamble:
{"title_options":["..."],"slug":"...","meta_description":"...","excerpt":"...","episodes_linked":[]}`;

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

  const step = body.step || 'body';
  const supabaseEarly = createAdminClient();

  // ---------------------------------------------------------------
  // STEP 2: metadata from a body that is already saved
  // ---------------------------------------------------------------
  if (step === 'meta') {
    if (!body.articleId) {
      return Response.json(
        { ok: false, error: 'articleId is required for the meta step' },
        { status: 400 }
      );
    }

    const { data: draft } = await supabaseEarly
      .from('articles')
      .select('id, body_html')
      .eq('id', body.articleId)
      .single();

    if (!draft || !draft.body_html) {
      return Response.json({ ok: false, error: 'Draft not found' }, { status: 404 });
    }

    let meta: Record<string, unknown>;
    try {
      const anthropic = getAnthropic();
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: META_SYSTEM,
        messages: [{ role: 'user', content: draft.body_html }],
      });

      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('');

      meta = JSON.parse(stripFences(text)) as Record<string, unknown>;
    } catch (err) {
      return Response.json(
        { ok: false, error: err instanceof Error ? err.message : 'Metadata failed' },
        { status: 502 }
      );
    }

    const titles = Array.isArray(meta.title_options)
      ? (meta.title_options as string[])
      : [];
    const title = titles.length > 0 ? titles[0] : 'Untitled';

    let slug =
      typeof meta.slug === 'string' && meta.slug.trim().length > 0
        ? meta.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    slug = slug.replace(/^-+/, '').replace(/-+$/, '').slice(0, 80);

    const { data: clash } = await supabaseEarly
      .from('articles')
      .select('id')
      .eq('slug', slug)
      .neq('id', body.articleId)
      .limit(1);

    if (clash && clash.length > 0) {
      slug = slug.slice(0, 70) + '-' + Date.now().toString().slice(-5);
    }

    await supabaseEarly
      .from('articles')
      .update({
        title: title,
        slug: slug,
        title_options: titles,
        meta_description:
          typeof meta.meta_description === 'string' ? meta.meta_description : null,
        excerpt: typeof meta.excerpt === 'string' ? meta.excerpt : null,
        episodes_linked: Array.isArray(meta.episodes_linked)
          ? meta.episodes_linked
          : [],
      })
      .eq('id', body.articleId);

    return Response.json({ ok: true, id: body.articleId, title: title, slug: slug });
  }

  // ---------------------------------------------------------------
  // STEP 1: write the post body
  // ---------------------------------------------------------------
  if (!body.input || body.input.trim().length < 5) {
    return Response.json(
      { ok: false, error: 'Say a bit more about what the post should cover.' },
      { status: 400 }
    );
  }

  const mode = body.mode || 'topic';
  const supabase = supabaseEarly;

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
      .limit(10);
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
    .slice(0, 10)
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
    .limit(2);

  const voiceBlock = ((refs as { title: string; body_html: string }[]) || [])
    .map((r) => {
      const plain = (r.body_html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return '--- ' + r.title + ' ---\n' + plain.slice(0, 2600);
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

  let parsed: Record<string, unknown> = {};

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: prompt.model || 'claude-sonnet-4-6',
      max_tokens: 2000,
      system:
        prompt.system_prompt +
        '\n\nFor this request return ONLY the post body as raw HTML paragraphs. ' +
        'No JSON, no title, no metadata, no markdown fences. Start with the first <p> tag.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    // Only the body comes back now, so nothing needs JSON escaping.
    let out = stripFences(text).trim();

    // Strip a leading JSON block or marker if the model adds one anyway
    const marker = out.indexOf('===BODY===');
    if (marker !== -1) {
      out = out.slice(marker + '===BODY==='.length).trim();
    } else if (out.startsWith('{')) {
      const firstTag = out.indexOf('<p');
      if (firstTag !== -1) out = out.slice(firstTag);
    }

    parsed.body_html = out;
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error:
          'Could not read the model output. ' +
          (err instanceof Error ? err.message : ''),
      },
      { status: 502 }
    );
  }

  // --- Save as a draft article ------------------------------------------
  let bodyHtml = typeof parsed.body_html === 'string' ? parsed.body_html.trim() : '';

  if (bodyHtml.length > 0 && bodyHtml.indexOf('<p') === -1) {
    bodyHtml = bodyHtml
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => '<p>' + p + '</p>')
      .join('\n');
  }

  if (bodyHtml.length < 200) {
    return Response.json(
      { ok: false, error: 'The model returned almost nothing. Try again.' },
      { status: 502 }
    );
  }

  const plain = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plain.split(/\s+/).filter(Boolean).length;

  // Placeholder slug and title. Step 2 replaces both.
  const tempSlug = 'draft-' + Date.now().toString(36);

  const { data: inserted, error: insErr } = await supabase
    .from('articles')
    .insert({
      slug: tempSlug,
      title: 'Untitled draft',
      body_html: bodyHtml,
      word_count: words,
      status: 'draft',
      source: 'standalone',
    })
    .select('id')
    .single();

  if (insErr) {
    return Response.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    id: inserted?.id,
    words: words,
    candidates: candidates.length,
  });
}
