export type Chapter = {
  time: string;
  label: string;
};

export type YouTubeParts = {
  intro?: string;
  bullets?: string[];
  chapters?: Chapter[];
  hashtags?: string[];
  thumbnail_phrase?: string;
};

export type YouTubeEpisodeInfo = {
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
  guest_links: { website?: string | null; linkedin?: string | null } | null;
};

/**
 * Convert MM:SS or H:MM:SS to seconds. Returns null if unparseable.
 */
function toSeconds(t: string): number | null {
  const parts = t.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n) || n < 0)) return null;

  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

function fromSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  if (h > 0) return h + ':' + pad(m) + ':' + pad(sec);
  return pad(m) + ':' + pad(sec);
}

/**
 * YouTube only renders chapters if the list obeys its rules:
 *   - the first entry is 00:00
 *   - there are at least 3 entries
 *   - each entry is at least 10 seconds after the one before it
 * A single bad line silently disables chapters for the whole video, so
 * enforce the rules here rather than trusting the model.
 */
export function normalizeChapters(raw: Chapter[]): {
  chapters: Chapter[];
  valid: boolean;
  note: string;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { chapters: [], valid: false, note: 'No chapters generated.' };
  }

  const parsed: { s: number; label: string }[] = [];

  for (const c of raw) {
    if (!c || typeof c.time !== 'string') continue;
    const s = toSeconds(c.time);
    if (s === null) continue;
    const label = (c.label || '').trim();
    if (label.length === 0) continue;
    parsed.push({ s: s, label: label });
  }

  parsed.sort((a, b) => a.s - b.s);

  // Drop entries less than 10 seconds after the previous kept one
  const spaced: { s: number; label: string }[] = [];
  for (const p of parsed) {
    if (spaced.length === 0 || p.s - spaced[spaced.length - 1].s >= 10) {
      spaced.push(p);
    }
  }

  if (spaced.length === 0) {
    return { chapters: [], valid: false, note: 'No usable timestamps found.' };
  }

  // The first chapter has to sit at zero
  if (spaced[0].s !== 0) {
    spaced.unshift({ s: 0, label: 'Intro' });
  }

  const chapters = spaced.map((p) => ({ time: fromSeconds(p.s), label: p.label }));

  if (chapters.length < 3) {
    return {
      chapters: chapters,
      valid: false,
      note:
        'Only ' +
        chapters.length +
        ' chapters. YouTube needs at least 3, so chapters will not render.',
    };
  }

  return { chapters: chapters, valid: true, note: '' };
}

export function buildYouTubeDescription(
  parts: YouTubeParts,
  ep: YouTubeEpisodeInfo,
  footer: string
): string {
  const num = ep.episode_number;
  const guest = ep.guest_name || '';
  const company = ep.guest_company || '';
  const links = ep.guest_links || {};
  const siteUrl =
    'https://misfitentrepreneur.com/episodes/ep-' + num + '-episode.html';

  const out: string[] = [];

  // Intro
  if (parts.intro) {
    out.push(parts.intro.trim());
    out.push('');
  }

  // Show notes link
  out.push('Full show notes: ' + siteUrl);
  out.push('');

  // What you will learn
  const bullets = Array.isArray(parts.bullets) ? parts.bullets : [];
  if (bullets.length > 0) {
    out.push('WHAT YOU WILL LEARN');
    for (const b of bullets) {
      out.push('- ' + b.trim());
    }
    out.push('');
  }

  // Guest links
  const guestLines: string[] = [];
  if (links.website) guestLines.push('Website: ' + links.website);
  if (links.linkedin) guestLines.push('LinkedIn: ' + links.linkedin);

  if (guest && guestLines.length > 0) {
    out.push('CONNECT WITH ' + guest.toUpperCase());
    if (company) out.push(company);
    for (const l of guestLines) out.push(l);
    out.push('');
  }

  // Chapters
  const norm = normalizeChapters(parts.chapters || []);
  if (norm.chapters.length > 0) {
    out.push('CHAPTERS');
    for (const c of norm.chapters) {
      out.push(c.time + ' ' + c.label);
    }
    out.push('');
  }

  // Standard footer from Settings
  if (footer && footer.trim().length > 0) {
    out.push(footer.trim());
    out.push('');
  }

  // Hashtags
  const tags = Array.isArray(parts.hashtags) ? parts.hashtags : [];
  if (tags.length > 0) {
    out.push(
      tags
        .map((t) => '#' + t.replace(/^#/, '').replace(/\s+/g, ''))
        .join(' ')
    );
  }

  return out.join('\n');
}
