#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Blog Archive Scraper
===========================================
Step 1: Uses Wayback Machine CDX API to get all blog post URLs
Step 2: Fetches content of each post from Wayback archive
Step 3: Extracts title, date, body
Step 4: Generates Misfit-branded HTML blog pages
Step 5: Builds blog index JSON

Run this locally or via GitHub Action.
"""
import os, re, json, time, html, requests
from datetime import datetime

SITE        = "misfitentrepreneur.com/blog/"
WAYBACK_CDX = "http://web.archive.org/cdx/search/cdx"
WAYBACK_BASE= "https://web.archive.org/web/"
BLOG_DIR    = "blog"
os.makedirs(BLOG_DIR, exist_ok=True)

# ── Step 1: Get all blog post URLs from CDX API ───────
print("Fetching blog post URLs from Wayback Machine CDX API...")
params = {
    "url":        f"{SITE}*",
    "output":     "json",
    "fl":         "original,timestamp",
    "filter":     "statuscode:200",
    "collapse":   "urlkey",
    "matchType":  "prefix",
    "limit":      "2000",
}
r = requests.get(WAYBACK_CDX, params=params, timeout=30)
rows = r.json()
print(f"CDX returned {len(rows)} rows")

# Filter to actual blog posts (not the index page itself)
posts = []
seen  = set()
for row in rows[1:]:  # skip header row
    url, timestamp = row[0], row[1]
    # Must be a blog post (has path after /blog/)
    path = url.replace("https://", "").replace("http://", "").replace("www.", "")
    path = path.replace("misfitentrepreneur.com/blog/", "").strip("/")
    if not path or "?" in path or path.startswith("page") or path.startswith("tag"):
        continue
    if path in seen:
        continue
    seen.add(path)
    posts.append({"url": url, "timestamp": timestamp, "slug": path})

print(f"Found {len(posts)} unique blog posts\n")

# ── Step 2 & 3: Fetch and parse each post ─────────────
def extract_content(wayback_url, original_url):
    """Fetch a page from Wayback and extract blog content."""
    try:
        r = requests.get(wayback_url, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            return None
        content = r.text

        # Extract title
        title = ""
        m = re.search(r'<title>([^<]+)</title>', content, re.I)
        if m:
            title = html.unescape(m.group(1))
            # Clean up " - Misfit Entrepreneur" suffix
            title = re.sub(r'\s*[-|]\s*Misfit Entrepreneur.*$', '', title).strip()

        # Try common blog post content selectors
        body = ""
        for pattern in [
            r'<div[^>]*class="[^"]*blog-post-content[^"]*"[^>]*>(.*?)</div\s*>',
            r'<div[^>]*class="[^"]*post-body[^"]*"[^>]*>(.*?)</div\s*>',
            r'<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)</div\s*>',
            r'<div[^>]*class="[^"]*paragraph[^"]*"[^>]*>(.*?)</div\s*>',
            r'<div[^>]*id="[^"]*content[^"]*"[^>]*>(.*?)</div\s*>',
        ]:
            m = re.search(pattern, content, re.I | re.DOTALL)
            if m and len(m.group(1)) > 200:
                body = m.group(1)
                break

        # Fallback: grab all <p> tags in the main content area
        if not body or len(body) < 200:
            paragraphs = re.findall(r'<p[^>]*>(.+?)</p>', content, re.DOTALL)
            # Filter out nav/footer junk (short paragraphs)
            good_paras = [p for p in paragraphs if len(re.sub(r'<[^>]+>', '', p).strip()) > 80]
            if good_paras:
                body = "\n".join(f"<p>{p}</p>" for p in good_paras[:50])

        # Clean body — remove Wayback Machine toolbar injections
        body = re.sub(r'<!-- BEGIN WAYBACK.*?END WAYBACK[^>]*-->', '', body, flags=re.DOTALL)
        body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.DOTALL)
        body = re.sub(r'<style[^>]*>.*?</style>', '', body, flags=re.DOTALL)

        # Extract publish date
        date_str = ""
        for pat in [
            r'<time[^>]*datetime="([^"]+)"',
            r'class="[^"]*date[^"]*"[^>]*>([^<]+)<',
            r'class="[^"]*published[^"]*"[^>]*>([^<]+)<',
        ]:
            m = re.search(pat, content, re.I)
            if m:
                date_str = m.group(1).strip()
                break

        return {"title": title, "body": body, "date": date_str}

    except Exception as e:
        print(f"  Error fetching {wayback_url}: {e}")
        return None

def make_blog_page(slug, title, date_str, body):
    """Generate a Misfit-branded blog post HTML page."""
    safe_title = html.escape(title)
    display_date = date_str or ""

    # Try to format date nicely
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%B %d, %Y"]:
        try:
            dt = datetime.strptime(date_str[:len(fmt)+2].strip(), fmt)
            display_date = dt.strftime("%B %d, %Y")
            break
        except:
            pass

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{safe_title} | Misfit Entrepreneur</title>
<meta name="description" content="{safe_title} — insights from Dave Lukas and the Misfit Entrepreneur community.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700;800&family=Source+Serif+4:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
body{{background:#0F0F0F;color:#d8d8d8;font-family:'Montserrat',sans-serif;}}
header{{position:fixed;top:0;left:0;right:0;z-index:900;height:70px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,10,0.96);border-bottom:1px solid rgba(240,180,41,0.1);}}
.logo a{{text-decoration:none;font-family:'Bebas Neue',sans-serif;font-size:22px;color:#F0B429;letter-spacing:2px;}}
nav a{{color:#aaa;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-left:28px;}}
nav a:hover{{color:#fff;}}
.post-wrap{{max-width:780px;margin:0 auto;padding:110px 24px 80px;}}
.post-eyebrow{{font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#F0B429;margin-bottom:16px;display:flex;align-items:center;gap:10px;}}
.post-eyebrow::before{{content:'';width:26px;height:2px;background:#F0B429;display:block;}}
.post-title{{font-family:'Bebas Neue',sans-serif;font-size:clamp(36px,5vw,60px);color:#fff;line-height:1;letter-spacing:1px;margin-bottom:20px;}}
.post-date{{font-size:12px;color:#555;margin-bottom:40px;}}
.post-body{{font-family:'Source Serif 4',serif;font-size:17px;font-weight:300;line-height:1.85;color:#bbb;}}
.post-body p{{margin-bottom:20px;}}
.post-body h2,.post-body h3{{font-family:'Bebas Neue',sans-serif;color:#fff;letter-spacing:1px;margin:36px 0 12px;}}
.post-body h2{{font-size:32px;}}
.post-body h3{{font-size:24px;}}
.post-body strong,.post-body b{{color:#fff;font-weight:700;}}
.post-body a{{color:#F0B429;}}
.post-body ul,.post-body ol{{margin:0 0 20px 24px;}}
.post-body li{{margin-bottom:8px;}}
.divider{{width:48px;height:2px;background:#F0B429;margin:48px 0;}}
.cta-box{{background:#141414;border:1px solid rgba(240,180,41,0.15);border-radius:10px;padding:36px;text-align:center;margin-top:60px;}}
.cta-box h3{{font-family:'Bebas Neue',sans-serif;font-size:28px;color:#fff;margin-bottom:12px;}}
.cta-box p{{font-size:13px;color:#888;margin-bottom:24px;}}
.cta-btn{{display:inline-block;background:#F0B429;color:#0F0F0F;font-weight:800;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:14px 32px;border-radius:4px;text-decoration:none;}}
.back-link{{display:inline-flex;align-items:center;gap:8px;color:#F0B429;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin-bottom:40px;}}
footer{{text-align:center;padding:40px 24px;border-top:1px solid #1a1a1a;font-size:11px;color:#444;}}
footer a{{color:#666;text-decoration:none;}}
</style>
</head>
<body>
<header>
  <div class="logo"><a href="/">MISFIT ENTREPRENEUR</a></div>
  <nav>
    <a href="/podcast.html">Podcast</a>
    <a href="/blog.html">Blog</a>
    <a href="/about.html">About Dave</a>
    <a href="/truths.html" style="background:#F0B429;color:#0F0F0F;padding:8px 16px;border-radius:3px;">Free Ebook</a>
  </nav>
</header>

<div class="post-wrap">
  <a href="/blog.html" class="back-link">← All Posts</a>
  <div class="post-eyebrow">Misfit Entrepreneur Blog</div>
  <h1 class="post-title">{safe_title}</h1>
  <div class="post-date">{display_date}</div>
  <div class="post-body">
    {body}
  </div>
  <div class="divider"></div>
  <div class="cta-box">
    <h3>Get The Misfit Code — Free</h3>
    <p>21 uncomfortable truths from 450+ world-class entrepreneurs. The raw wisdom that separates misfit operators from everyone else.</p>
    <a href="/truths.html" class="cta-btn">Download Free →</a>
  </div>
</div>

<footer>
  <p>© 2025 Misfit Entrepreneur · <a href="/podcast.html">Podcast</a> · <a href="/blog.html">Blog</a> · <a href="/contact.html">Contact</a></p>
</footer>
</body>
</html>'''

# ── Process posts ──────────────────────────────────────
blog_index = []
processed  = 0
failed     = 0

print(f"Processing {len(posts)} posts...\n")

for i, post in enumerate(posts):
    slug      = post["slug"]
    timestamp = post["timestamp"]
    orig_url  = post["url"]

    # Check if already generated
    outpath = os.path.join(BLOG_DIR, f"{slug}.html")
    if os.path.exists(outpath):
        print(f"  — Skip (exists): {slug}")
        # Still add to index
        blog_index.append({"slug": slug, "title": slug.replace("-", " ").title(), "date": ""})
        continue

    wayback_url = f"{WAYBACK_BASE}{timestamp}/{orig_url}"
    print(f"  [{i+1}/{len(posts)}] {slug[:60]}")

    data = extract_content(wayback_url, orig_url)

    if not data or not data.get("title") or len(data.get("body","")) < 100:
        print(f"    ✗ No content extracted")
        failed += 1
        time.sleep(1)
        continue

    page = make_blog_page(slug, data["title"], data["date"], data["body"])

    with open(outpath, "w", encoding="utf-8") as f:
        f.write(page)

    blog_index.append({
        "slug":  slug,
        "title": data["title"],
        "date":  data["date"],
    })

    processed += 1
    print(f"    ✓ Saved: {data['title'][:60]}")
    time.sleep(1.5)  # Be polite to Wayback Machine

# ── Save index JSON ────────────────────────────────────
with open("blog_index.json", "w") as f:
    json.dump(blog_index, f, indent=2)

print(f"\n{'='*60}")
print(f"Processed : {processed}")
print(f"Failed    : {failed}")
print(f"Total     : {len(blog_index)} in index")
print(f"{'='*60}")
print("Next: run build_blog_index.py to generate blog.html")
