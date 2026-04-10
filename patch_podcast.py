#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — podcast.html Patcher
===========================================
Adds Show Notes linking to podcast.html using episode_index.json.

USAGE:
  1. Download podcast.html from GitHub
  2. Place it in the same folder as this script
  3. Run:  python3 patch_podcast.py
  4. Upload patched podcast.html back to GitHub
"""

import sys, re

INPUT = "podcast.html"
print("=" * 55)
print(" Misfit Entrepreneur — podcast.html Patcher")
print("=" * 55)

try:
    with open(INPUT, 'r', encoding='utf-8') as f:
        html = f.read()
    print(f"\n✓ Loaded {INPUT} ({len(html):,} chars)")
except FileNotFoundError:
    print(f"\n❌ {INPUT} not found. Download from GitHub first.")
    sys.exit(1)

changes = 0

# ── 1. Add slugMap variable ────────────────────────────────
OLD = "let allEps = [], filtered = [], page = 1;"
NEW = "let allEps = [], filtered = [], page = 1;\nlet slugMap = {};  // ep num -> slug from episode_index.json"
if OLD in html:
    html = html.replace(OLD, NEW, 1); changes += 1
    print("✓ 1/5  slugMap variable added")
else:
    print("⚠ 1/5  slugMap — anchor not found")

# ── 2. Add getShowNotesUrl() helper ───────────────────────
HELPER = """
function getShowNotesUrl(ep) {
  const slug = slugMap[String(ep.num)];
  return slug ? '/episodes/' + slug + '.html' : null;
}"""

m = re.search(r'(function fmtDur\(d\) \{[^}]+\})', html)
if m:
    html = html[:m.end()] + HELPER + html[m.end():]; changes += 1
    print("✓ 2/5  getShowNotesUrl() helper added")
else:
    print("⚠ 2/5  helper — fmtDur() not found")

# ── 3. Parallel fetch of episode_index.json ───────────────
OLD3 = "const res = await fetch(PROXY);"
NEW3 = """// Fetch RSS + episode index in parallel
    const [rssRes, idxRes] = await Promise.all([
      fetch(PROXY),
      fetch('/episode_index.json').catch(() => null)
    ]);
    if (idxRes && idxRes.ok) {
      try {
        const idx = await idxRes.json();
        idx.forEach(ep => { slugMap[String(ep.num)] = ep.slug; });
        console.log('Index: ' + idx.length + ' slugs loaded');
      } catch(e) { console.warn('index parse error', e); }
    }
    const res = rssRes;"""

if OLD3 in html:
    html = html.replace(OLD3, NEW3, 1); changes += 1
    print("✓ 3/5  Parallel fetch added")
else:
    print("⚠ 3/5  fetch — anchor not found")

# ── 4. Show Notes in featured cards ───────────────────────
OLD4 = "        <div class=\"fplay\">▶ Play Episode</div>"
NEW4 = (
    "        <div class=\"fplay\">▶ Play Episode</div>\n"
    "        ${getShowNotesUrl(ep) ? "
    "`<a href=\"${getShowNotesUrl(ep)}\" onclick=\"event.stopPropagation()\" "
    "style=\"display:block;margin-top:8px;font-size:9px;font-weight:700;"
    "letter-spacing:1.5px;text-transform:uppercase;color:#555;text-decoration:none;"
    "transition:color .2s;\" onmouseover=\"this.style.color='#F5C400'\" "
    "onmouseout=\"this.style.color='#555'\">Show Notes →</a>` : ''}"
)
if OLD4 in html:
    html = html.replace(OLD4, NEW4, 1); changes += 1
    print("✓ 4/5  Show Notes link added to featured cards")
else:
    print("⚠ 4/5  featured card — anchor not found")

# ── 5. Show Notes button in episode rows ──────────────────
# Insert between Misfit 3 tag and share-wrap span
OLD5_PATTERN = r'(<span class="etag">Misfit 3™</span>)(\s*<span class="share-wrap")'
NEW5_REPL = (
    r'\1\n          '
    '${(() => { const sn = getShowNotesUrl(ep); return sn ? '
    '`<a class="share-btn" href="${sn}" onclick="event.stopPropagation()" '
    'style="text-decoration:none;">📄 Show Notes</a>` : \'\'; })()}'
    r'\2'
)
html_new, n = re.subn(OLD5_PATTERN, NEW5_REPL, html, count=1)
if n:
    html = html_new; changes += 1
    print("✓ 5/5  Show Notes button added to episode rows")
else:
    print("⚠ 5/5  episode row — pattern not found")

# ── Write output ───────────────────────────────────────────
with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"\n{'='*55}")
print(f"{'✅ COMPLETE' if changes == 5 else '⚠  PARTIAL'}  — {changes}/5 changes applied")
print(f"{'='*55}")
print("\nNEXT STEPS:")
print("  1. Upload podcast.html to GitHub")
print("  2. Netlify deploys in ~30 seconds")
print("  3. Show Notes buttons appear on all matched episodes")
if changes < 5:
    print(f"\n  ⚠  {5-changes} change(s) skipped. Share the ⚠ lines above for debug.")
