export const runtime = 'nodejs';

import { createAdminClient } from '@/lib/supabase-server';
import { getAnthropic, fillTemplate } from '@/lib/anthropic';

type Body = {
  episodeId: string;
  assetType: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { episodeId, assetType } = body;
  if (!episodeId || !assetType) {
    return new Response('episodeId and assetType are required', { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: episode, error: epErr } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', episodeId)
    .single();

  if (epErr || !episode) {
    return new Response('Episode not found', { status: 404 });
  }

  if (!episode.transcript || episode.transcript.length < 500) {
    return new Response('Episode has no usable transcript', { status: 400 });
  }

  const { data: prompt, error: prErr } = await supabase
    .from('prompts')
    .select('*')
    .eq('asset_type', assetType)
    .eq('is_active', true)
    .single();

  if (prErr || !prompt) {
    return new Response(
      'No active prompt found for asset type: ' + assetType,
      { status: 400 }
    );
  }

  // Base variables from the episode record
  const vars: Record<string, string> = {
    guest_name: episode.guest_name || '',
    guest_company: episode.guest_company || '',
    guest_email: episode.guest_email || '',
    episode_number: String(episode.episode_number),
    title: episode.title || '',
    release_date: episode.release_date || '',
    site_url: episode.site_url || '',
    transcript: episode.transcript,
  };

  // Global settings, available as {{setting_key}}
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value');

  if (settings) {
    for (const s of settings) {
      if (s.value) vars[s.key] = s.value;
    }
  }

  // Previously generated assets, available as {{asset_type}}.
  // This is what lets later passes avoid repeating earlier ones.
  const { data: priorAssets } = await supabase
    .from('episode_assets')
    .select('asset_type, content')
    .eq('episode_id', episodeId)
    .eq('is_current', true);

  if (priorAssets) {
    for (const a of priorAssets) {
      if (a.content && a.asset_type !== assetType) {
        vars[a.asset_type] = a.content;
      }
    }
  }

  const userContent = fillTemplate(prompt.user_template, vars);
  const systemContent = fillTemplate(prompt.system_prompt, vars);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let full = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const anthropic = getAnthropic();

        const msgStream = anthropic.messages.stream({
          model: prompt.model || 'claude-sonnet-4-6',
          max_tokens: prompt.max_tokens || 8000,
          system: systemContent,
          messages: [{ role: 'user', content: userContent }],
        });

        for await (const event of msgStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMsg = await msgStream.finalMessage();
        inputTokens = finalMsg.usage.input_tokens;
        outputTokens = finalMsg.usage.output_tokens;

        await supabase
          .from('episode_assets')
          .update({ is_current: false })
          .eq('episode_id', episodeId)
          .eq('asset_type', assetType)
          .eq('is_current', true);

        const { data: prev } = await supabase
          .from('episode_assets')
          .select('version')
          .eq('episode_id', episodeId)
          .eq('asset_type', assetType)
          .order('version', { ascending: false })
          .limit(1);

        const nextVersion = prev && prev.length > 0 ? prev[0].version + 1 : 1;

        await supabase.from('episode_assets').insert({
          episode_id: episodeId,
          asset_type: assetType,
          content: full,
          version: nextVersion,
          is_current: true,
        });

        await supabase.from('generation_runs').insert({
          episode_id: episodeId,
          asset_type: assetType,
          prompt_id: prompt.id,
          model: prompt.model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          duration_ms: Date.now() - started,
          status: 'success',
        });

        await supabase
          .from('episodes')
          .update({ status: 'ready' })
          .eq('id', episodeId);

        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown generation error';

        await supabase.from('generation_runs').insert({
          episode_id: episodeId,
          asset_type: assetType,
          prompt_id: prompt.id,
          model: prompt.model,
          duration_ms: Date.now() - started,
          status: 'error',
          error: message,
        });

        controller.enqueue(encoder.encode('\n\n[GENERATION ERROR] ' + message));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
