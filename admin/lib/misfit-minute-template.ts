export type MinuteParts = {
  subject_options?: string[];
  preview_text?: string;
  intro?: string;
  episode_blurb?: string;
  vault_blurb?: string;
  one_thing?: string;
  blog_blurb?: string;
  quote?: string;
  signoff?: string;
  vault?: {
    episode_number: number;
    title: string | null;
    guest_name: string | null;
    slug: string;
  } | null;
  article?: { slug: string; title: string } | null;
};

export type MinuteEpisodeInfo = {
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
};

export type MinuteSponsor = {
  name: string;
  newsletter_copy: string | null;
  shownotes_copy: string | null;
  offer_url: string | null;
  url: string | null;
  logo_url: string | null;
};

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SITE = 'https://misfitentrepreneur.com';

export function buildMinuteHtml(
  parts: MinuteParts,
  ep: MinuteEpisodeInfo,
  sponsors: MinuteSponsor[],
  volume: string,
  issue: string
): string {
  const epUrl = SITE + '/episodes/ep-' + ep.episode_number + '-episode.html';
  const guest = ep.guest_name || '';
  const company = ep.guest_company || '';

  const vault = parts.vault || null;
  const vaultUrl = vault ? SITE + '/episodes/' + vault.slug + '.html' : '';

  const article = parts.article || null;
  const articleUrl = article ? SITE + '/blog/' + article.slug + '.html' : '';

  const sponsorHtml = sponsors
    .map((s) => {
      const copy = s.newsletter_copy || s.shownotes_copy || '';
      const link = s.offer_url || s.url || '';
      const logo = s.logo_url
        ? '<img src="' + esc(s.logo_url) + '" alt="' + esc(s.name) +
          '" class="sp-logo">'
        : '';
      const cta = link
        ? '<a href="' + esc(link) + '" class="sp-link">Learn more &rarr;</a>'
        : '';
      return (
        '<div class="sponsor">' + logo +
        '<div class="sp-name">' + esc(s.name) + '</div>' +
        '<p class="sp-copy">' + copy + '</p>' + cta + '</div>'
      );
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>The Misfit Minute</title>
<style>
body{margin:0;padding:20px;background:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}
.wrap{max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
.head{background:#0F0F0F;padding:26px 32px;border-bottom:3px solid #F0B429;}
.head .brand{color:#F0B429;font-size:19px;font-weight:700;letter-spacing:4px;text-transform:uppercase;}
.head .vol{color:#666;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;}
.body{padding:34px 38px;color:#1a1a1a;line-height:1.65;font-size:15px;}
.body p{margin:0 0 16px 0;}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#8a6a00;margin:0 0 10px 0;}
h2{font-size:20px;font-weight:700;color:#0F0F0F;margin:0 0 10px 0;line-height:1.3;}
h3{font-size:16px;font-weight:700;color:#0F0F0F;margin:0 0 8px 0;}
hr{border:none;border-top:2px solid #F0B429;margin:30px 0;}
.rule{border:none;border-top:1px solid #e2e2e2;margin:26px 0;}
.btn{display:inline-block;background:#F0B429;color:#0F0F0F !important;padding:12px 26px;border-radius:5px;text-decoration:none;font-weight:700;font-size:14px;}
.card{background:#faf8f2;border-left:4px solid #F0B429;border-radius:0 6px 6px 0;padding:20px 24px;margin:0 0 8px 0;}
.card p:last-child{margin-bottom:0;}
.quote{background:#0F0F0F;border-radius:8px;padding:28px 30px;text-align:center;}
.quote p{color:#fff;font-family:Georgia,serif;font-style:italic;font-size:18px;line-height:1.5;margin:0 0 12px 0;}
.quote .attr{color:#F0B429;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
.sponsor{border:1px solid #e8e2d4;border-radius:6px;padding:20px 22px;margin-bottom:12px;background:#fdfcf9;}
.sp-logo{display:block;height:38px;width:auto;max-width:170px;object-fit:contain;margin-bottom:12px;}
.sp-name{font-weight:700;font-size:15px;color:#0F0F0F;margin-bottom:6px;}
.sp-copy{font-size:13.5px;color:#55503f;margin:0 0 10px 0;line-height:1.6;}
.sp-link{color:#8a6a00;font-size:13px;font-weight:600;text-decoration:none;}
.foot{background:#0a0a0a;padding:26px 32px;text-align:center;}
.foot p{color:#555;font-size:11.5px;margin:0 0 8px 0;}
.foot a{color:#F0B429;text-decoration:none;}
.sign{font-weight:600;color:#0F0F0F;margin-top:22px !important;}
a{color:#0F0F0F;}
@media(max-width:600px){.body{padding:24px 22px;}body{padding:8px;}}
</style>
</head>
<body>
<div class="wrap">

<div class="head">
  <div class="brand">The Misfit Minute</div>
  <div class="vol">Volume ${esc(volume)} &middot; Issue ${esc(issue)}</div>
</div>

<div class="body">

<p>${parts.intro || ''}</p>

<hr>

<div class="eyebrow">This Week's Episode</div>
<h2>${esc(ep.title || '')}</h2>
<p style="font-size:13.5px;color:#666;margin-bottom:12px;">with ${esc(guest)}${company ? ' &mdash; ' + esc(company) : ''}</p>
<p>${parts.episode_blurb || ''}</p>
<p><a href="${esc(epUrl)}" class="btn">Listen Now</a></p>

<hr class="rule">

<div class="eyebrow">One Thing to Try</div>
<div class="card">
  <p>${parts.one_thing || ''}</p>
</div>

${vault ? `<hr class="rule">

<div class="eyebrow">From the Vault</div>
<h3>Episode ${vault.episode_number}: ${esc(vault.title || '')}</h3>
<p>${parts.vault_blurb || ''}</p>
<p><a href="${esc(vaultUrl)}">Listen to this one &rarr;</a></p>` : ''}

${article ? `<hr class="rule">

<div class="eyebrow">From the Blog</div>
<h3>${esc(article.title)}</h3>
<p>${parts.blog_blurb || ''}</p>
<p><a href="${esc(articleUrl)}">Read it &rarr;</a></p>` : ''}

${sponsors.length > 0 ? `<hr>

<div class="eyebrow">Supported By</div>
${sponsorHtml}` : ''}

${parts.quote ? `<hr>

<div class="quote">
  <p>${esc(parts.quote)}</p>
  <div class="attr">${esc(guest)}</div>
</div>` : ''}

<p class="sign">${parts.signoff || ''}<br>Stay misfit,<br>Dave</p>

</div>

<div class="foot">
  <p><a href="${SITE}/code">Get The Misfit Code free</a> &middot; <a href="${SITE}/playbook">The Execution Playbook</a></p>
  <p>The Misfit Entrepreneur &middot; Dave Lukas</p>
  <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</div>

</div>
</body>
</html>`;
}
