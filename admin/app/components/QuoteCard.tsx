'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { stripFences } from '@/lib/anthropic';

type Size = { key: string; label: string; w: number; h: number };

const SIZES: Size[] = [
  { key: 'square', label: 'Instagram square', w: 1080, h: 1080 },
  { key: 'portrait', label: 'Instagram portrait', w: 1080, h: 1350 },
  { key: 'landscape', label: 'X and LinkedIn', w: 1200, h: 630 },
];

type Theme = { key: string; label: string; bg: string; fg: string; accent: string; sub: string };

const THEMES: Theme[] = [
  { key: 'dark', label: 'Black', bg: '#0e0e0e', fg: '#ffffff', accent: '#F5C400', sub: '#8a8a8a' },
  { key: 'gold', label: 'Gold', bg: '#F5C400', fg: '#0e0e0e', accent: '#0e0e0e', sub: '#4a4030' },
  { key: 'cream', label: 'Cream', bg: '#f4f1e8', fg: '#1a1712', accent: '#8a6a00', sub: '#6a6252' },
];

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const w of words) {
    const test = line.length === 0 ? w : line + ' ' + w;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export default function QuoteCard({
  episodeId,
  episodeNumber,
  guestName,
}: {
  episodeId: string;
  episodeNumber: number;
  guestName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [quote, setQuote] = useState('');
  const [attrib, setAttrib] = useState(guestName);
  const [size, setSize] = useState<Size>(SIZES[0]);
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [options, setOptions] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Pull the best quote and any clip moments as starting options
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('episode_assets')
        .select('asset_type, content')
        .eq('episode_id', episodeId)
        .eq('is_current', true);

      const found: string[] = [];

      for (const r of (data as { asset_type: string; content: string | null }[]) ?? []) {
        if (!r.content) continue;
        if (r.asset_type !== 'show_notes_extras') continue;
        try {
          const parsed = JSON.parse(stripFences(r.content));
          if (typeof parsed.best_quote === 'string') found.push(parsed.best_quote);
          if (Array.isArray(parsed.clip_moments)) {
            for (const c of parsed.clip_moments) {
              const t = typeof c === 'string' ? c : c && c.quote ? c.quote : null;
              if (typeof t === 'string' && t.length > 20 && t.length < 260) found.push(t);
            }
          }
        } catch {
          // nothing usable in this asset
        }
      }

      setOptions(found);
      if (found.length > 0 && quote.length === 0) setQuote(found[0]);
    }

    load();
  }, [episodeId]);

  // Fonts must be loaded before the canvas draws or it silently falls back
  useEffect(() => {
    let cancelled = false;
    const anyDoc = document as unknown as { fonts?: { ready: Promise<unknown> } };
    if (anyDoc.fonts) {
      anyDoc.fonts.ready.then(() => {
        if (!cancelled) setReady(true);
      });
    } else {
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    draw();
  }, [quote, attrib, size, theme, ready, episodeNumber]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = size.w;
    const H = size.h;
    canvas.width = W;
    canvas.height = H;

    const pad = Math.round(W * 0.09);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // accent rule top left
    ctx.fillStyle = theme.accent;
    ctx.fillRect(pad, pad, Math.round(W * 0.09), 8);

    // opening mark
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.28;
    ctx.font = '700 ' + Math.round(W * 0.16) + 'px Georgia, serif';
    ctx.textBaseline = 'top';
    ctx.fillText('\u201C', pad - 6, pad + Math.round(W * 0.035));
    ctx.globalAlpha = 1;

    // quote, shrunk to fit
    const maxWidth = W - pad * 2;
    let fontSize = Math.round(W * 0.062);
    let lines: string[] = [];

    for (let i = 0; i < 24; i++) {
      ctx.font = '600 ' + fontSize + 'px Georgia, serif';
      lines = wrap(ctx, quote || 'Your quote goes here.', maxWidth);
      const blockHeight = lines.length * fontSize * 1.34;
      const available = H - pad * 2 - Math.round(W * 0.24);
      if (blockHeight <= available || fontSize <= 20) break;
      fontSize -= 3;
    }

    const lineHeight = fontSize * 1.34;
    const blockHeight = lines.length * lineHeight;
    let y = Math.max(
      pad + Math.round(W * 0.17),
      (H - blockHeight) / 2 - Math.round(H * 0.03)
    );

    ctx.fillStyle = theme.fg;
    ctx.font = '600 ' + fontSize + 'px Georgia, serif';
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += lineHeight;
    }

    // attribution
    y += Math.round(fontSize * 0.55);
    ctx.fillStyle = theme.accent;
    ctx.font = '700 ' + Math.round(W * 0.026) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText((attrib || '').toUpperCase(), pad, y);

    // footer
    ctx.fillStyle = theme.sub;
    ctx.font = '600 ' + Math.round(W * 0.02) + 'px Montserrat, Arial, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      'THE MISFIT ENTREPRENEUR  \u00B7  EPISODE ' + episodeNumber,
      pad,
      H - pad
    );

    ctx.textAlign = 'right';
    ctx.fillText('MISFITENTREPRENEUR.COM', W - pad, H - pad);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download =
      'ep-' + episodeNumber + '-quote-' + size.key + '-' + theme.key + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow">Graphics</div>
      <h3 style={{ marginBottom: 8 }}>Quote Card</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        Instagram needs an image, not a caption. Pick a line, choose a size, download
        the PNG.
      </p>

      {options.length > 0 && (
        <div className="field">
          <label>Lines from this episode</label>
          {options.slice(0, 6).map((o, i) => (
            <div
              key={i}
              onClick={() => setQuote(o)}
              style={{
                fontSize: 13,
                color: quote === o ? '#F0B429' : '#9a9a9a',
                padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,.04)',
                cursor: 'pointer',
                lineHeight: 1.5,
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="qt">Quote</label>
        <textarea
          id="qt"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          rows={3}
        />
        <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
          {quote.length} characters. Under 180 reads best.
        </div>
      </div>

      <div className="field">
        <label htmlFor="at">Attribution</label>
        <input
          id="at"
          type="text"
          value={attrib}
          onChange={(e) => setAttrib(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {SIZES.map((s) => (
          <button
            key={s.key}
            className={size.key === s.key ? 'btn' : 'btn btn-ghost'}
            style={{ padding: '7px 14px', fontSize: 11.5 }}
            onClick={() => setSize(s)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {THEMES.map((t) => (
          <button
            key={t.key}
            className={theme.key === t.key ? 'btn' : 'btn btn-ghost'}
            style={{ padding: '7px 14px', fontSize: 11.5 }}
            onClick={() => setTheme(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 6,
          padding: 14,
          marginBottom: 14,
          textAlign: 'center',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            maxWidth: size.key === 'landscape' ? 460 : 340,
            height: 'auto',
            borderRadius: 4,
          }}
        />
      </div>

      <button className="btn" onClick={download}>
        Download PNG
      </button>
    </div>
  );
}
