export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate, stripFences } from '@/lib/anthropic';

type Body = {
  episodeId: string;
};

type VaultEpisode = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  key_theme: string | null;
  best_quote: string | null;
  slug: string | null;
};

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
};

/**
 * Rotate fairly: take the pool that has waited longest, then pick at random
 * within it. Straight ordering would surface the same episode every week
 * until it is promoted, which makes the section feel mechanical.
 */
function pickOne<T>(pool: T[]): T | null {
  if (!pool || pool.length === 0) return null;
  const top = pool.slice(0, Math.min(pool.length, 8));
  return top[Math.floor(Math.random() * top.length)];
}

export async function POST(req: Request) {
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

  // --- This week's episode -------------------------------------------
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', body.episodeId)
    .single();

  if (epErr || !ep) {
    return Response.json({ ok: false, error: 'Episode not found' }, { status: 404 });
  }

  // --- Show notes context --------------------------------------------
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
      { ok: false, error: 'Generate the show notes for this episode first.' },
      { status: 400 }
    );
  }

  // --- From the Vault --------------------------------------------------
  const { data: vaultPool } = await supabase
    .from('episodes')
    .select('id, episode_number, title, guest_name, key_theme, best_quote, slug')
    .gte('evergreen_score', 4)
    .not('key_theme', 'is', null)
    .neq('id', body.episodeId)
    .order('last_promoted_at', { ascending: true, nullsFirst: true })
    .limit(40);

  const vault = pickOne((vaultPool as VaultEpisode[]) || []);

  // --- From the Blog ---------------------------------------------------
  const { data: blogPool } = await supabase
    .from('articles')
    .select('id, slug, title, excerpt')
    .eq('status', 'published')
    .order('last_promoted_at', { ascending: true, nullsFirst: true })
    .limit(20);

  const article = pickOne((blogPool as Article[]) || []);

  // --- Prompt ----------------------------------------------------------
  const { data: prompt } = await supabase
    .from('prompts')
    .select('system_prompt, user_template, model, max_tokens')
    .eq('asset_type', 'newsletter_parts')
    .eq('is_active', true)
    .single();

  if (!prompt) {
    return Response.json(
      { ok: false, error: 'No active newsletter_parts prompt found.' },
      { status: 400 }
    );
  }

  const vaultText = vault
    ? 'Episode ' + vault.episode_number + ': ' + (vault.title || '') +
      (vault.guest_name ? ' (guest: ' + vault.guest_name + ')' : '') +
      '\n' + (vault.key_theme || '') +
      (vault.best_quote ? '\nQuote: ' + vault.best_quote : '')
    : 'None available.';

  const blogText = article
    ? article.title + '\n' + (article.excerpt || '')
    : 'None available.';

  const vars: Record<string, string> = {
    episode_number: String(ep.episode_number),
    title: ep.title || '',
    guest_name: ep.guest_name || '',
    guest_company: ep.guest_company || '',
    transcript: (ep.transcript || '').slice(0, 60000),
    vault_episode: vaultText,
    blog_post: blogText,
    show_notes_meta: assets.show_notes_meta || '',
    show_notes_extras: assets.show_notes_extras || '',
  };

  const userMessage = fillTemplate(prompt.user_template, vars);

  let parsed: Record<string, unknown>;
  let rawText = '';

  try {
    const anthropic = getAnthropic();
    const msg = await anthropic.messages.create({
      model: prompt.model || 'claude-sonnet-4-6',
      max_tokens: prompt.max_tokens || 2500,
      system: prompt.system_prompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    rawText = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    parsed = JSON.parse(stripFences(rawText)) as Record<string, unknown>;
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 }
    );
  }

  // Carry the selections through so the assembler can build real links
  parsed.vault = vault
    ? {
        episode_number: vault.episode_number,
        title: vault.title,
        guest_name: vault.guest_name,
        slug: vault.slug || 'ep-' + vault.episode_number + '-episode',
      }
    : null;

  parsed.article = article
    ? { slug: article.slug, title: article.title }
    : null;

  const content = JSON.stringify(parsed, null, 2);

  // --- Save, versioned like every other asset --------------------------
  await supabase
    .from('episode_assets')
    .update({ is_current: false })
    .eq('episode_id', body.episodeId)
    .eq('asset_type', 'newsletter_parts')
    .eq('is_current', true);

  const { data: prev } = await supabase
    .from('episode_assets')
    .select('version')
    .eq('episode_id', body.episodeId)
    .eq('asset_type', 'newsletter_parts')
    .order('version', { ascending: false })
    .limit(1);

  await supabase.from('episode_assets').insert({
    episode_id: body.episodeId,
    asset_type: 'newsletter_parts',
    content: content,
    version: prev && prev.length > 0 ? prev[0].version + 1 : 1,
    is_current: true,
  });

  return Response.json({
    ok: true,
    vault: vault ? vault.episode_number : null,
    article: article ? article.slug : null,
    chars: content.length,
  });
}
