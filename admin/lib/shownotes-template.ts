export type Section = {
  slot: string;
  question: string;
  bullets: string[];
};

export type Misfit3Item = {
  title: string;
  body: string;
};

export type Takeaway = {
  headline: string;
  body: string;
};

export type ShowNotesData = {
  recommended_title?: string;
  title_options?: string[];
  meta_description?: string;
  guest_bio?: string;
  tldr?: string[];
  topics?: string[];
  sections?: Section[];
  best_quote?: string;
  misfit_3?: Misfit3Item[];
  takeaways?: Takeaway[];
};

export type EpisodeInfo = {
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
  release_date: string | null;
  libsyn_player_embed: string | null;
  guest_links: { website?: string | null; linkedin?: string | null } | null;
};

export type SponsorInfo = {
  name: string;
  tier: string | null;
  slot: string | null;
  shownotes_copy: string | null;
  offer_url: string | null;
  url: string | null;
  logo_url: string | null;
};

// How each slot is presented on the page. The misfit3 slot is handled
// separately because it renders inside the Misfit 3 section rather than
// in the sponsor block, and newsletter sponsors never appear here at all.
const SLOT_HEADINGS: { slot: string; heading: string }[] = [
  { slot: 'preroll', heading: 'Presented By' },
  { slot: 'midroll', heading: 'Also Supported By' },
];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const m = months[parseInt(parts[1], 10) - 1] || '';
  return m + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
}

function endPunct(s: string): string {
  const t = s.trim();
  if (t.length === 0) return t;
  const last = t.charAt(t.length - 1);
  if (last === '.' || last === '!' || last === '?' || last === ':') return t;
  return t + '.';
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:#0e0e0e;color:#c9c9c9;font-family:'Montserrat',sans-serif;font-size:15px;line-height:1.75;overflow-x:hidden;padding-top:70px;}
a{color:#F5C400;text-decoration:none;}
a:hover{text-decoration:underline;}
.wrap{max-width:820px;margin:0 auto;padding:0 24px;}

/* ---------- SITE HEADER ---------- */
header{position:fixed;top:0;left:0;right:0;z-index:900;height:70px;padding:0 56px;display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,10,.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(245,196,0,.1);transition:background .3s;}
.logo img{height:42px;width:auto;display:block;}
nav{display:flex;align-items:center;gap:30px;}
nav a{color:#aaa;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;transition:color .2s;}
nav a:hover{color:#fff;text-decoration:none;}
.ncta{background:#F5C400!important;color:#0e0e0e!important;padding:9px 20px;border-radius:3px;font-size:10px!important;font-weight:800!important;}
.ncta:hover{background:#e6b800!important;}
.mbtn{display:none;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;}

/* ---------- SECTION BANDS ---------- */
section{padding:52px 0;}
.band-dark{background:#0e0e0e;}
.band-mid{background:#131313;border-top:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04);}
.band-gold{background:linear-gradient(180deg,#191408 0%,#15110a 100%);border-top:1px solid rgba(245,196,0,.18);border-bottom:1px solid rgba(245,196,0,.18);}
.band-light{background:#f4f1e8;color:#2a2620;border-top:4px solid #F5C400;border-bottom:4px solid #F5C400;}

/* ---------- HERO ---------- */
.hero{background:linear-gradient(180deg,#141414 0%,#0e0e0e 100%);border-bottom:1px solid rgba(245,196,0,.1);padding:56px 0 46px;}
.ep-num{font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#F5C400;margin-bottom:14px;}
h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(34px,5vw,54px);color:#fff;letter-spacing:1px;line-height:1.05;margin-bottom:14px;font-weight:400;}
.guest-line{font-size:14px;color:#888;margin-bottom:26px;}
.guest-line strong{color:#e0e0e0;}
.listen-row{display:flex;gap:10px;flex-wrap:wrap;}
.listen-btn{background:#F5C400;color:#0e0e0e;padding:11px 22px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
.listen-btn:hover{text-decoration:none;background:#e6b800;}
.listen-btn.alt{background:transparent;border:1px solid rgba(245,196,0,.35);color:#F5C400;}
.listen-btn.alt:hover{background:rgba(245,196,0,.08);}

.player-box{background:#141414;border:1px solid rgba(245,196,0,.12);border-radius:8px;padding:20px;}
.player-pending{text-align:center;padding:20px;color:#666;font-size:13px;}
.player-pending strong{color:#F5C400;display:block;font-size:15px;margin-bottom:4px;}

.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#F5C400;margin-bottom:14px;}
.eyebrow::before{content:'';width:24px;height:2px;background:#F5C400;}
.band-light .eyebrow{color:#8a6a00;}
.band-light .eyebrow::before{background:#8a6a00;}
h2{font-family:'Bebas Neue',sans-serif;font-size:34px;color:#fff;letter-spacing:1px;margin-bottom:18px;font-weight:400;}
.band-light h2{color:#1a1712;}
p{margin-bottom:16px;}

.tldr{background:#141414;border-left:3px solid #F5C400;border-radius:0 8px 8px 0;padding:26px 30px;}
.tldr ul{list-style:none;}
.tldr li{padding-left:22px;position:relative;margin-bottom:11px;font-size:14px;color:#b0b0b0;}
.tldr li::before{content:'\\2192';position:absolute;left:0;color:#F5C400;font-weight:700;}

.guest-card h3{font-size:19px;font-weight:700;color:#fff;margin-bottom:10px;}
.guest-links{display:flex;gap:18px;flex-wrap:wrap;margin-top:6px;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;}

.qa{margin-bottom:32px;padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,.05);}
.qa:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0;}
.qa-label{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(245,196,0,.55);margin-bottom:8px;}
.qa .q{font-size:18px;font-weight:600;color:#fff;line-height:1.4;margin-bottom:14px;padding-left:18px;border-left:3px solid #F5C400;}
.qa ul{list-style:none;padding-left:18px;}
.qa li{position:relative;padding-left:20px;margin-bottom:10px;font-size:14.5px;color:#b5b5b5;}
.qa li::before{content:'';position:absolute;left:0;top:11px;width:6px;height:6px;background:rgba(245,196,0,.5);border-radius:50%;}

.bigquote{text-align:center;max-width:660px;margin:0 auto;}
.bigquote .mark{font-family:'Source Serif 4',Georgia,serif;font-size:76px;color:rgba(245,196,0,.3);line-height:.6;}
.bigquote p{font-family:'Source Serif 4',Georgia,serif;font-style:italic;font-size:24px;color:#fff;line-height:1.5;margin:14px 0 18px;}
.bq-attr{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F5C400;}

.m3-intro{color:#5a5348;font-size:14.5px;margin-bottom:28px;}
.m3-grid{display:grid;gap:14px;}
.m3-card{background:#fff;border:1px solid rgba(0,0,0,.07);border-left:4px solid #F5C400;border-radius:0 8px 8px 0;padding:24px 28px;display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:start;}
.m3-num{font-family:'Bebas Neue',sans-serif;font-size:46px;color:#F5C400;line-height:.9;}
.m3-card h4{font-size:16px;font-weight:700;color:#1a1712;margin-bottom:7px;}
.m3-card p{font-size:14.5px;color:#55503f;margin:0;line-height:1.7;}

.takeaways{counter-reset:t;}
.takeaways li{list-style:none;counter-increment:t;position:relative;padding-left:46px;margin-bottom:20px;font-size:14.5px;color:#b5b5b5;}
.takeaways li::before{content:counter(t);position:absolute;left:0;top:0;width:30px;height:30px;background:rgba(245,196,0,.1);border:1px solid rgba(245,196,0,.35);border-radius:50%;color:#F5C400;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.tk-head{display:block;color:#e8e8e8;font-weight:700;margin-bottom:5px;}

.share-row{display:flex;gap:10px;flex-wrap:wrap;}
.share-btn{border:1px solid rgba(245,196,0,.3);color:#F5C400;padding:10px 20px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:1px;background:transparent;cursor:pointer;font-family:'Montserrat',sans-serif;}
.share-btn:hover{background:rgba(245,196,0,.08);text-decoration:none;}

.sponsor{background:rgba(255,255,255,.03);border:1px solid rgba(245,196,0,.22);border-radius:8px;padding:26px 30px;margin-bottom:14px;}
.sponsor-label{display:inline-block;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0e0e0e;background:#F5C400;padding:4px 10px;border-radius:3px;margin-bottom:12px;}
.sponsor-logo{display:block;height:46px;width:auto;max-width:190px;object-fit:contain;background:#fff;border-radius:4px;padding:7px 10px;margin-bottom:14px;}
.sponsor h4{font-size:17px;font-weight:700;color:#fff;margin-bottom:8px;}
.sponsor p{font-size:14px;color:#a9a29a;margin-bottom:12px;}
.sponsor-group{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#F5C400;margin:26px 0 14px;}
.sponsor-group:first-of-type{margin-top:0;}
.m3-sponsor{font-size:12.5px;color:#7a7261;margin:-14px 0 26px;font-weight:600;}
.m3-sponsor a{color:#8a6a00;}

details{background:#141414;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:20px 26px;}
summary{cursor:pointer;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#F5C400;list-style:none;}
summary::-webkit-details-marker{display:none;}
.transcript-body{margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);font-size:13.5px;color:#8a8a8a;line-height:1.9;max-height:480px;overflow-y:auto;white-space:pre-wrap;}

/* ---------- SITE FOOTER ---------- */
footer{background:#080808;border-top:1px solid rgba(245,196,0,.08);padding:64px 80px 40px;}
.fg{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px;margin-bottom:48px;}
.fb img{height:34px;margin-bottom:16px;display:block;}
.fb p{font-size:12px;color:#555;line-height:1.8;max-width:240px;}
.fs{display:flex;gap:10px;margin-top:20px;}
.fsa{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:4px;display:flex;align-items:center;justify-content:center;color:#555;text-decoration:none;font-size:11px;font-weight:700;transition:all .2s;}
.fsa:hover{border-color:#F5C400;color:#F5C400;text-decoration:none;}
.fc h4{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#F5C400;margin-bottom:16px;}
.fc ul{list-style:none;display:flex;flex-direction:column;gap:10px;}
.fc a{color:#555;text-decoration:none;font-size:12px;transition:color .2s;}
.fc a:hover{color:#d8d8d8;text-decoration:none;}
.fb2{border-top:1px solid rgba(255,255,255,.04);padding-top:24px;display:flex;justify-content:space-between;align-items:center;}
.fb2 p,.fb2 a{font-size:11px;color:#2e2e2e;text-decoration:none;}
.fb2 a:hover{color:#F5C400;}

@media(max-width:900px){
  header{padding:0 24px;}
  nav{display:none;position:absolute;top:70px;left:0;right:0;background:#0e0e0e;padding:20px;flex-direction:column;gap:16px;border-bottom:1px solid rgba(245,196,0,.1);}
  nav.open{display:flex;}
  .mbtn{display:block;}
  footer{padding:48px 24px 32px;}
  .fg{grid-template-columns:1fr 1fr;gap:32px;}
}
@media(max-width:640px){
  section{padding:40px 0;}
  .m3-card{grid-template-columns:1fr;gap:6px;}
  .bigquote p{font-size:19px;}
  .fg{grid-template-columns:1fr;}
  .fb2{flex-direction:column;gap:12px;text-align:center;}
}
`;

const SITE_HEADER = `<header id="hdr">
  <a href="/" class="logo"><img src="/images/logo.jpg" alt="Misfit Entrepreneur"></a>
  <nav id="nav">
    <a href="/podcast/">Podcast</a>
    <a href="/about/">About Dave</a>
    <a href="/contact/">Contact</a>
    <a href="/code" class="ncta">Free Misfit Code</a>
  </nav>
  <button class="mbtn" onclick="document.getElementById('nav').classList.toggle('open')">&#9776;</button>
</header>`;

const SITE_FOOTER = `<footer><div class="fg">
  <div class="fb">
    <img src="/images/logo.jpg" alt="Misfit Entrepreneur">
    <p>The weekly podcast giving you access and actionable insight from the world's top entrepreneurs.</p>
    <div class="fs">
      <a href="https://www.instagram.com/misfitentrepreneur/" class="fsa" target="_blank" rel="noopener">IG</a>
      <a href="https://x.com/PodcastMisfit" class="fsa" target="_blank" rel="noopener">&#120143;</a>
      <a href="https://www.youtube.com/@misfitentrepreneur" class="fsa" target="_blank" rel="noopener">YT</a>
      <a href="https://www.linkedin.com/in/davelukas/" class="fsa" target="_blank" rel="noopener">IN</a>
    </div>
  </div>
  <div class="fc"><h4>Navigate</h4><ul>
    <li><a href="/">Home</a></li>
    <li><a href="/podcast/">Podcast</a></li>
    <li><a href="/about/">About Dave</a></li>
    <li><a href="/contact/">Contact</a></li>
  </ul></div>
  <div class="fc"><h4>Listen On</h4><ul>
    <li><a href="https://podcasts.apple.com/us/podcast/dave-lukas-the-misfit-entrepreneur-breakthrough/id1145889006" target="_blank" rel="noopener">Apple Podcasts</a></li>
    <li><a href="https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik" target="_blank" rel="noopener">Spotify</a></li>
    <li><a href="https://www.youtube.com/@misfitentrepreneur" target="_blank" rel="noopener">YouTube</a></li>
    <li><a href="https://soundcloud.com/misfitentrepreneur" target="_blank" rel="noopener">SoundCloud</a></li>
  </ul></div>
  <div class="fc"><h4>Resources</h4><ul>
    <li><a href="/code">Free Misfit Code</a></li>
    <li><a href="/playbook/">Execution Playbook &mdash; $29</a></li>
    <li><a href="/contact/">Contact Us</a></li>
  </ul></div>
</div>
<div class="fb2">
  <p>&copy; 2026 Misfit Entrepreneur &middot; Dave Lukas &middot; All Rights Reserved</p>
  <div style="display:flex;gap:20px;"><a href="/privacy-policy/">Privacy</a><a href="/terms/">Terms</a></div>
</div></footer>`;

export function buildShowNotesHtml(
  data: ShowNotesData,
  ep: EpisodeInfo,
  sponsors: SponsorInfo[],
  transcript: string
): string {
  const title = ep.title || data.recommended_title || 'Untitled Episode';
  const num = ep.episode_number;
  const guest = ep.guest_name || '';
  const company = ep.guest_company || '';
  const sections = data.sections || [];
  const links = ep.guest_links || {};
  const firstName = guest.split(' ')[0] || '';
  const possessive = firstName.length > 0 ? firstName + "'s" : 'Their';

  const pageUrl =
    'https://misfitentrepreneur.com/episodes/ep-' + num + '-episode.html';

  const quote = data.best_quote || '';
  const shareText = quote.length > 0 && quote.length < 180 ? quote : title;

  const encUrl = encodeURIComponent(pageUrl);
  const encText = encodeURIComponent(shareText);
  const xShare = 'https://twitter.com/intent/tweet?text=' + encText + '&url=' + encUrl;
  const liShare = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encUrl;
  const fbShare = 'https://www.facebook.com/sharer/sharer.php?u=' + encUrl;

  const player = ep.libsyn_player_embed
    ? ep.libsyn_player_embed
    : '<div class="player-pending"><strong>Episode drops ' +
      esc(fmtDate(ep.release_date)) +
      '</strong>Player appears here automatically on release.</div>';

  const tldrHtml = (data.tldr || [])
    .map((t) => '      <li>' + t + '</li>')
    .join('\n');

  const sectionsHtml = sections
    .map((s, i) => {
      const n = String(i + 1).padStart(2, '0');
      const bullets = (s.bullets || [])
        .map((b) => '        <li>' + b + '</li>')
        .join('\n');
      return (
        '    <div class="qa">\n' +
        '      <div class="qa-label">' + n + ' &middot; ' + esc(s.slot) + '</div>\n' +
        '      <div class="q">' + esc(s.question) + '</div>\n' +
        '      <ul>\n' + bullets + '\n      </ul>\n' +
        '    </div>'
      );
    })
    .join('\n');

  const m3Html = (data.misfit_3 || [])
    .map((m, i) => {
      const n = String(i + 1).padStart(2, '0');
      return (
        '      <div class="m3-card"><div class="m3-num">' + n + '</div><div>' +
        '<h4>' + esc(m.title) + '</h4><p>' + m.body + '</p></div></div>'
      );
    })
    .join('\n');

  const takeawaysHtml = (data.takeaways || [])
    .map(
      (t) =>
        '      <li><span class="tk-head">' +
        esc(endPunct(t.headline)) +
        '</span>' +
        t.body +
        '</li>'
    )
    .join('\n');

  function sponsorCard(s: SponsorInfo): string {
    const link = s.offer_url || s.url || '';
    const linkHtml = link
      ? '<a href="' + esc(link) + '">Learn more &rarr;</a>'
      : '';
    const logoHtml = s.logo_url
      ? '<img class="sponsor-logo" src="' + esc(s.logo_url) +
        '" alt="' + esc(s.name) + '" loading="lazy">'
      : '';
    return (
      '    <div class="sponsor"><div class="sponsor-label">' +
      esc(s.tier || 'Sponsor') +
      '</div>' + logoHtml +
      '<h4>' + esc(s.name) + '</h4><p>' +
      (s.shownotes_copy || '') + '</p>' + linkHtml + '</div>'
    );
  }

  // Newsletter-only sponsors are excluded from the page entirely.
  const pageSponsors = sponsors.filter((s) => s.slot !== 'newsletter');

  const misfit3Sponsor = pageSponsors.find((s) => s.slot === 'misfit3') || null;

  const groups: string[] = [];
  const placed: SponsorInfo[] = [];

  for (const g of SLOT_HEADINGS) {
    const inSlot = pageSponsors.filter((s) => s.slot === g.slot);
    if (inSlot.length === 0) continue;
    inSlot.forEach((s) => placed.push(s));
    groups.push(
      '    <h3 class="sponsor-group">' + esc(g.heading) + '</h3>\n' +
      inSlot.map(sponsorCard).join('\n')
    );
  }

  // Anything without a recognised slot still gets shown, so a sponsor can
  // never silently vanish because of a missing or unexpected slot value.
  const unplaced = pageSponsors.filter(
    (s) => s.slot !== 'misfit3' && placed.indexOf(s) === -1
  );
  if (unplaced.length > 0) {
    groups.push(unplaced.map(sponsorCard).join('\n'));
  }

  const sponsorHtml = groups.join('\n');
  const hasSponsorBlock = groups.length > 0;

  const guestLinksHtml = [
    links.website ? '<a href="' + esc(links.website) + '" target="_blank" rel="noopener">Website</a>' : '',
    links.linkedin ? '<a href="' + esc(links.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : '',
  ]
    .filter((x) => x.length > 0)
    .join('\n        ');

  const sponsorSection =
    hasSponsorBlock
      ? '<section class="band-gold">\n  <div class="wrap">\n' +
        '    <div class="eyebrow">Supported By</div>\n' +
        '    <h2>This Week\'s Sponsors</h2>\n' +
        sponsorHtml +
        '\n  </div>\n</section>'
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} | Misfit Entrepreneur</title>
<meta name="description" content="${esc(data.meta_description || '')}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(data.meta_description || '')}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700;800;900&family=Source+Serif+4:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>

${SITE_HEADER}

<div class="hero">
  <div class="wrap">
    <div class="ep-num">Episode ${num} &middot; The Misfit Entrepreneur</div>
    <h1>${esc(title)}</h1>
    <p class="guest-line">with <strong>${esc(guest)}</strong>${company ? ' &mdash; ' + esc(company) : ''}</p>
    <div class="listen-row">
      <a href="https://podcasts.apple.com/us/podcast/dave-lukas-the-misfit-entrepreneur-breakthrough/id1145889006" class="listen-btn alt" target="_blank" rel="noopener">Apple Podcasts</a>
      <a href="https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik" class="listen-btn alt" target="_blank" rel="noopener">Spotify</a>
      <a href="https://www.youtube.com/@misfitentrepreneur" class="listen-btn alt" target="_blank" rel="noopener">YouTube</a>
    </div>
  </div>
</div>

<section class="band-dark">
  <div class="wrap">
    <div class="player-box" style="margin-bottom:34px;">${player}</div>
    <div class="eyebrow">The 60-Second Version</div>
    <div class="tldr"><ul>
${tldrHtml}
    </ul></div>
  </div>
</section>

<section class="band-mid">
  <div class="wrap">
    <div class="eyebrow">About the Guest</div>
    <div class="guest-card">
      <h3>${esc(guest)}</h3>
      <p>${data.guest_bio || ''}</p>
      <div class="guest-links">
        ${guestLinksHtml}
      </div>
    </div>
  </div>
</section>

<section class="band-dark">
  <div class="wrap">
    <div class="eyebrow">The Conversation</div>
    <h2>What We Covered</h2>
${sectionsHtml}
  </div>
</section>

<section class="band-gold">
  <div class="wrap">
    <div class="bigquote">
      <div class="mark">&ldquo;</div>
      <p>${esc(quote)}</p>
      <div class="bq-attr">${esc(guest)}</div>
    </div>
  </div>
</section>

<section class="band-light">
  <div class="wrap">
    <div class="eyebrow">The Misfit 3&trade;</div>
    <h2>${esc(possessive)} Three</h2>
    <p class="m3-intro">The three things ${esc(firstName || 'they')} would leave behind for the generations that come after.</p>
    ${misfit3Sponsor ? '<p class="m3-sponsor">The Misfit 3&trade; is brought to you by <a href="' + esc(misfit3Sponsor.offer_url || misfit3Sponsor.url || '#') + '">' + esc(misfit3Sponsor.name) + '</a></p>' : ''}
    <div class="m3-grid">
${m3Html}
    </div>
  </div>
</section>

<section class="band-dark">
  <div class="wrap">
    <div class="eyebrow">Put It To Work</div>
    <h2>Five Things You Can Act On</h2>
    <ol class="takeaways">
${takeawaysHtml}
    </ol>
  </div>
</section>

<section class="band-dark">
  <div class="wrap">
    <div class="eyebrow">Pass It On</div>
    <h2>Share This Episode</h2>
    <p style="color:#888;font-size:14px;">One great episode can change someone's life. If something here landed, send it to one entrepreneur who needs it this week.</p>
    <div class="share-row">
      <a href="${esc(xShare)}" class="share-btn" target="_blank" rel="noopener">Share on X</a>
      <a href="${esc(liShare)}" class="share-btn" target="_blank" rel="noopener">Share on LinkedIn</a>
      <a href="${esc(fbShare)}" class="share-btn" target="_blank" rel="noopener">Share on Facebook</a>
      <button class="share-btn" id="copyLinkBtn">Copy Link</button>
    </div>
  </div>
</section>

${sponsorSection}

<section class="band-dark">
  <div class="wrap">
    <div class="eyebrow">Full Transcript</div>
    <details>
      <summary>Read the complete transcript</summary>
      <div class="transcript-body">${esc(transcript)}</div>
    </details>
  </div>
</section>

${SITE_FOOTER}

<script>
(function () {
  var btn = document.getElementById('copyLinkBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var url = ${JSON.stringify(pageUrl)};
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = original; }, 1800);
      });
    }
  });
})();
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "PodcastEpisode",
  "url": ${JSON.stringify(pageUrl)},
  "name": ${JSON.stringify(title)},
  "episodeNumber": ${num},
  "datePublished": ${JSON.stringify(ep.release_date || '')},
  "description": ${JSON.stringify(data.meta_description || '')},
  "partOfSeries": { "@type": "PodcastSeries", "name": "The Misfit Entrepreneur", "url": "https://misfitentrepreneur.com/podcast" },
  "author": { "@type": "Person", "name": "Dave Lukas" }
}
</script>

</body>
</html>`;
}
