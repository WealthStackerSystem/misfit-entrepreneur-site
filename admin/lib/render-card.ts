/**
 * Draws a quote card on an off-screen canvas and returns base64 PNG data.
 *
 * The same drawing code the visible QuoteCard uses, extracted so the Social
 * queue can render missing Instagram images without anyone opening an editor.
 * Canvas is browser-only, which is why this runs on page load rather than in
 * the Monday cron.
 */

export type CardTheme = 'dark' | 'gold' | 'cream';

const THEMES: Record<
  CardTheme,
  { bg: string; fg: string; accent: string; sub: string }
> = {
  dark: { bg: '#0e0e0e', fg: '#ffffff', accent: '#F5C400', sub: '#8a8a8a' },
  gold: { bg: '#F5C400', fg: '#0e0e0e', accent: '#0e0e0e', sub: '#4a4030' },
  cream: { bg: '#f4f1e8', fg: '#1a1712', accent: '#8a6a00', sub: '#6a6252' },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

export async function renderCardPng(opts: {
  quote: string;
  attribution: string;
  episodeNumber: number;
  width?: number;
  height?: number;
  theme?: CardTheme;
}): Promise<string> {
  const W = opts.width || 1080;
  const H = opts.height || 1350;
  const t = THEMES[opts.theme || 'dark'];

  // Webfonts must be resolved first or the canvas silently uses a fallback
  const anyDoc = document as unknown as { fonts?: { ready: Promise<unknown> } };
  if (anyDoc.fonts) {
    try {
      await anyDoc.fonts.ready;
    } catch {
      // carry on with whatever is available
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  const pad = Math.round(W * 0.09);

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = t.accent;
  ctx.fillRect(pad, pad, Math.round(W * 0.09), 8);

  ctx.globalAlpha = 0.28;
  ctx.font = '700 ' + Math.round(W * 0.16) + 'px Georgia, serif';
  ctx.textBaseline = 'top';
  ctx.fillText('\u201C', pad - 6, pad + Math.round(W * 0.035));
  ctx.globalAlpha = 1;

  const maxWidth = W - pad * 2;
  let fontSize = Math.round(W * 0.062);
  let lines: string[] = [];

  for (let i = 0; i < 24; i++) {
    ctx.font = '600 ' + fontSize + 'px Georgia, serif';
    lines = wrap(ctx, opts.quote, maxWidth);
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

  ctx.fillStyle = t.fg;
  ctx.font = '600 ' + fontSize + 'px Georgia, serif';
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += lineHeight;
  }

  y += Math.round(fontSize * 0.55);
  ctx.fillStyle = t.accent;
  ctx.font = '700 ' + Math.round(W * 0.026) + 'px Montserrat, Arial, sans-serif';
  ctx.fillText((opts.attribution || '').toUpperCase(), pad, y);

  ctx.fillStyle = t.sub;
  ctx.font = '600 ' + Math.round(W * 0.02) + 'px Montserrat, Arial, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    'THE MISFIT ENTREPRENEUR  \u00B7  EPISODE ' + opts.episodeNumber,
    pad,
    H - pad
  );
  ctx.textAlign = 'right';
  ctx.fillText('MISFITENTREPRENEUR.COM', W - pad, H - pad);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
