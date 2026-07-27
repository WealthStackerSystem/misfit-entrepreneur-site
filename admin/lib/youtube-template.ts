export type YouTubeParts = {
  intro?: string;
  bullets?: string[];
  // The model returns plain labels in order. Older runs returned
  // {time,label} objects, so both shapes are accepted.
  chapters?: (string | { time?: string; label?: string })[];
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
 * Riverside timestamps are taken before editing. Camtasia cuts and sponsor
 * breaks shift everything, and the drift compounds across the episode, so
 * generated times would send viewers to the wrong place.
 *
 * Instead the model returns the topic sequence and we emit placeholders for
 * Dave to fill in during the Camtasia pass. The first chapter is always
 * 00:00 because YouTube requires it.
 */
export function buildChapterLines(raw: YouTubeParts['chapters']): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const labels: string[] = [];

  for (const c of raw) {
    let label = '';
    if (typeof c === 'string') {
      label = c.trim();
    } else if (c && typeof c === 'object') {
      label = (c.label || '').trim();
    }
    // strip any leading timestamp the model may have prepended
    label = label.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*[-\u2013]?\s*/, '').trim();
    if (label.length > 0) labels.push(label);
  }

  if (labels.length === 0) return [];

  return labels.map((label, i) =>
    (i === 0 ? '00:00' : '__:__') + ' ' + label
  );
}

export function chapterWarning(lines: string[]): string | null {
  if (lines.length === 0) {
    return 'No chapters generated. YouTube chapters will not render.';
  }
  if (lines.length < 3) {
    return (
      'Only ' +
      lines.length +
      ' chapters. YouTube needs at least 3, so chapters will not render.'
    );
  }
  return null;
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

  if (parts.intro) {
    out.push(parts.intro.trim());
    out.push('');
  }

  out.push('Full show notes: ' + siteUrl);
  out.push('');

  const bullets = Array.isArray(parts.bullets) ? parts.bullets : [];
  if (bullets.length > 0) {
    out.push('WHAT YOU WILL LEARN');
    for (const b of bullets) {
      out.push('- ' + b.trim());
    }
    out.push('');
  }

  const guestLines: string[] = [];
  if (links.website) guestLines.push('Website: ' + links.website);
  if (links.linkedin) guestLines.push('LinkedIn: ' + links.linkedin);

  if (guest && guestLines.length > 0) {
    out.push('CONNECT WITH ' + guest.toUpperCase());
    if (company) out.push(company);
    for (const l of guestLines) out.push(l);
    out.push('');
  }

  const chapterLines = buildChapterLines(parts.chapters);
  if (chapterLines.length > 0) {
    out.push('CHAPTERS');
    for (const line of chapterLines) {
      out.push(line);
    }
    out.push('');
  }

  if (footer && footer.trim().length > 0) {
    out.push(footer.trim());
    out.push('');
  }

  const tags = Array.isArray(parts.hashtags) ? parts.hashtags : [];
  if (tags.length > 0) {
    out.push(
      tags.map((t) => '#' + t.replace(/^#/, '').replace(/\s+/g, '')).join(' ')
    );
  }

  return out.join('\n');
}
