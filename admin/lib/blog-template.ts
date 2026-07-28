export type BlogPost = {
  slug: string;
  title: string;
  body_html: string;
  meta_description: string | null;
  publish_date: string | null;
};

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function humanDate(iso: string | null): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const m = MONTHS[parseInt(parts[1], 10) - 1];
  if (!m) return iso;
  return m + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0F0F0F;color:#d8d8d8;font-family:'Montserrat',sans-serif}
header{position:fixed;top:0;left:0;right:0;height:70px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,10,.96);border-bottom:1px solid rgba(240,180,41,.1);z-index:900}
.logo img{height:42px;width:auto;display:block}
nav a{color:#aaa;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-left:28px}
nav a:hover{color:#fff}
.ncta{background:#F0B429!important;color:#0F0F0F!important;padding:8px 16px;border-radius:3px}
.wrap{max-width:780px;margin:0 auto;padding:110px 24px 80px}
.back{display:inline-flex;align-items:center;gap:8px;color:#F0B429;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin-bottom:32px}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#F0B429;margin-bottom:14px}
h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(36px,5vw,58px);color:#fff;line-height:1;margin-bottom:16px}
.date{font-size:12px;color:#555;margin-bottom:40px;letter-spacing:.5px}
.body{font-family:'Source Serif 4',serif;font-size:17px;font-weight:300;line-height:1.85;color:#bbb}
.body p{margin-bottom:20px}
.body h2,.body h3{font-family:'Bebas Neue',sans-serif;color:#fff;margin:32px 0 12px}
.body h2{font-size:30px}.body h3{font-size:22px}
.body strong,.body b{color:#fff}.body a{color:#F0B429}
.body ul,.body ol{margin:0 0 20px 24px}.body li{margin-bottom:8px}
.divider{width:48px;height:2px;background:#F0B429;margin:48px 0}
.cta{background:#141414;border:1px solid rgba(240,180,41,.15);border-radius:10px;padding:36px;text-align:center}
.cta h3{font-family:'Bebas Neue',sans-serif;font-size:26px;color:#fff;margin-bottom:10px}
.cta p{font-size:14px;color:#999;margin-bottom:20px;line-height:1.7}
.cta a{display:inline-block;background:#F0B429;color:#0F0F0F;padding:13px 30px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}
footer{background:#080808;border-top:1px solid rgba(240,180,41,.08);padding:36px 24px;text-align:center}
footer p{font-size:11px;color:#444}
footer a{color:#F0B429;text-decoration:none}
@media(max-width:700px){header{padding:0 20px}nav a{margin-left:14px;font-size:10px}.wrap{padding:96px 20px 60px}}
`;

export function buildBlogHtml(post: BlogPost): string {
  const url = 'https://misfitentrepreneur.com/blog/' + post.slug + '.html';
  const desc = post.meta_description || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(post.title)} | Misfit Entrepreneur</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700;800&family=Source+Serif+4:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>

<header>
  <a href="/" class="logo"><img src="/images/logo.jpg" alt="Misfit Entrepreneur"></a>
  <nav>
    <a href="/podcast/">Podcast</a>
    <a href="/blog.html">Blog</a>
    <a href="/about/">About</a>
    <a href="/code" class="ncta">Free Misfit Code</a>
  </nav>
</header>

<div class="wrap">
  <a href="/blog.html" class="back">&larr; All Posts</a>
  <div class="eyebrow">Misfit Entrepreneur Blog</div>
  <h1>${esc(post.title)}</h1>
  <div class="date">${esc(humanDate(post.publish_date))}</div>

  <div class="body">${post.body_html}</div>

  <div class="divider"></div>

  <div class="cta">
    <h3>Get The Misfit Code &mdash; Free</h3>
    <p>21 uncomfortable truths from 450+ world-class entrepreneurs. The raw wisdom that separates misfit operators from everyone else.</p>
    <a href="/code">Download Free &rarr;</a>
  </div>
</div>

<footer>
  <p>&copy; 2026 Misfit Entrepreneur &middot; Dave Lukas &middot;
     <a href="/podcast/">Podcast</a> &middot;
     <a href="/blog.html">Blog</a> &middot;
     <a href="/contact/">Contact</a></p>
</footer>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": ${JSON.stringify(post.title)},
  "description": ${JSON.stringify(desc)},
  "url": ${JSON.stringify(url)},
  "datePublished": ${JSON.stringify(post.publish_date || '')},
  "author": { "@type": "Person", "name": "Dave Lukas" },
  "publisher": { "@type": "Organization", "name": "The Misfit Entrepreneur" }
}
</script>

</body>
</html>`;
}
