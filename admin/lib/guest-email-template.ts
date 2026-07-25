export type GuestEmailParts = {
  opener_line?: string;
  linkedin_post?: string;
  x_post?: string;
  instagram_caption?: string;
};

export type GuestEmailInfo = {
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
  release_date: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildGuestEmailHtml(
  parts: GuestEmailParts,
  ep: GuestEmailInfo,
  calendlyUrl: string,
  applePodcastsUrl: string,
  spotifyUrl: string,
  youtubeUrl: string
): string {
  const guest = ep.guest_name || '';
  const firstName = guest.split(' ')[0] || 'there';
  const title = ep.title || 'your episode';
  const num = ep.episode_number;
  const pageUrl =
    'https://misfitentrepreneur.com/episodes/ep-' + num + '-episode.html';

  const li = (parts.linkedin_post || '').split('{{URL}}').join(pageUrl);
  const xp = (parts.x_post || '').split('{{URL}}').join(pageUrl);
  const ig = (parts.instagram_caption || '').split('{{URL}}').join(pageUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Your episode is live</title>
<style>
body{margin:0;padding:20px;background:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}
.email-wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
.email-header{background:#0F0F0F;padding:26px 32px;border-bottom:3px solid #F0B429;text-align:center;}
.email-header .brand{color:#F0B429;font-size:20px;font-weight:700;letter-spacing:4px;text-transform:uppercase;}
.email-header .sub{color:#666;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;}
.email-body{padding:36px 40px;color:#1a1a1a;line-height:1.65;font-size:15px;}
.email-body p{margin:0 0 16px 0;}
.email-body h2{color:#0F0F0F;font-size:20px;font-weight:600;margin:32px 0 12px 0;}
.email-body h3{color:#0F0F0F;font-size:16px;font-weight:600;margin:26px 0 10px 0;}
.listen-primary{border:2px solid #F0B429;border-radius:8px;padding:16px 20px;margin:20px 0;background:#fffbf0;}
.listen-primary strong{color:#0F0F0F;display:block;margin-bottom:5px;font-size:14px;}
.listen-primary a{color:#0F0F0F;text-decoration:underline;font-size:14px;word-break:break-all;}
.listen-secondary{padding-left:20px;margin:12px 0 20px 0;}
.listen-secondary li{margin-bottom:6px;}
.listen-secondary a{color:#0F0F0F;}
hr.divider{border:none;border-top:2px solid #F0B429;margin:32px 0;}
.post-block{background:#f8f8f8;padding:20px;border-left:4px solid #F0B429;margin:12px 0;font-family:Georgia,serif;white-space:pre-wrap;font-size:14px;line-height:1.7;border-radius:0 4px 4px 0;}
.small-ask{background:#fffbf0;padding:20px 24px;border-radius:8px;margin:16px 0;border:1px solid #F0B429;}
.small-ask p{margin:0 0 12px 0;}
.small-ask p:last-child{margin-bottom:0;}
.collab{background:#0F0F0F;border-radius:10px;padding:30px 32px;margin:22px 0;color:#e0e0e0;}
.collab .eyebrow{color:#F0B429;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;}
.collab h3{color:#fff;font-size:22px;margin:0 0 14px 0;font-weight:700;}
.collab p{color:#b8b8b8;font-size:14.5px;line-height:1.7;margin:0 0 14px 0;}
.collab .cta{display:inline-block;background:#F0B429;color:#0F0F0F;padding:13px 28px;border-radius:5px;text-decoration:none;font-weight:700;font-size:14px;margin-top:6px;}
.collab .fine{color:#777;font-size:12.5px;margin:14px 0 0 0;}
.ps{font-size:13px;color:#666;font-style:italic;margin-top:16px !important;}
.signature{margin-top:24px;font-weight:600;color:#0F0F0F;}
a{color:#0F0F0F;}
@media(max-width:600px){.email-body{padding:24px 20px;}body{padding:8px;}.collab{padding:24px 22px;}}
</style>
</head>
<body>
<div class="email-wrap">

<div class="email-header">
  <div class="brand">Misfit Entrepreneur</div>
  <div class="sub">Episode ${num}</div>
</div>

<div class="email-body">

<p>${esc(firstName)},</p>

<p>Your episode is live.</p>

<p>Before anything else &mdash; thank you. ${esc(parts.opener_line || '')}</p>

<p><strong>Here it is:</strong></p>

<div class="listen-primary">
<strong>Listen and full show notes:</strong>
<a href="${esc(pageUrl)}">${esc(pageUrl)}</a>
</div>

<p><strong>Other places it is live:</strong></p>
<ul class="listen-secondary">
<li><a href="${esc(applePodcastsUrl)}">Apple Podcasts</a></li>
<li><a href="${esc(spotifyUrl)}">Spotify</a></li>
<li><a href="${esc(youtubeUrl)}">YouTube</a></li>
</ul>

<hr class="divider">

<h2>Everything you need to share it</h2>

<p>I know you are busy, so I did the work for you. Everything below is ready to post. Copy, paste, and tag me so I can amplify it.</p>

<h3>LinkedIn</h3>
<div class="post-block">${esc(li)}</div>

<h3>X</h3>
<div class="post-block">${esc(xp)}</div>

<h3>Instagram</h3>
<div class="post-block">${esc(ig)}</div>

<hr class="divider">

<h2>One small ask</h2>

<div class="small-ask">
<p>If the conversation resonated with you &mdash; and especially if anything we discussed has already sparked something &mdash; <strong>hit reply with a one-line note</strong>. Just a sentence or two. I share the best ones with my audience and use them when talking to sponsors, so real words from real operators carry weight.</p>
<p>No pressure. Only if the episode actually did something for you.</p>
</div>

<hr class="divider">

<div class="collab">
<div class="eyebrow">One more thing</div>
<h3>The Misfit Exchange</h3>
<p>Every time I sit down with a guest outside the podcast, we find something. An introduction. A client. A partner. A blind spot one of us could see and the other could not.</p>
<p>So I keep 30 minutes open for it. No pitch, no agenda &mdash; just two operators comparing notes on what we are each building and where we might be useful to each other. After 460 episodes I have a deep network of entrepreneurs across 100 countries, and more often than not there is someone in it you should know.</p>
<a href="${esc(calendlyUrl)}" class="cta">Grab 30 minutes</a>
<p class="fine">If the timing is not right now, the link stays good &mdash; reach out whenever. And any time something big happens in your world, a launch, a pivot, a hard lesson worth sharing, just reply to this thread. I have a lot of Misfits who may want to hear about it.</p>
</div>

<p>Until then &mdash; <strong>stay misfit</strong>.</p>

<p class="signature">Dave</p>

<p class="ps">P.S. &mdash; If copy-pasting from email is annoying, just reply and I will send everything as a Google Doc. Whatever makes this easier.</p>

<p class="ps">P.P.S. &mdash; Know someone building something remarkable who should be on the show? Send me a warm intro. The Misfit tribe grows through people like you.</p>

</div>
</div>
</body>
</html>`;
}
