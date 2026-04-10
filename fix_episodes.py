#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Episode Pages Quick Fix
==============================================
Fixes two issues across all /episodes/*.html files:
  1. Spotify link → correct show page URL
  2. Ebook cover image → Misfit Entrepreneur podcast logo

Run automatically via GitHub Actions.
"""

import os
import glob

EPISODES_DIR = "episodes"

# Correct Spotify show URL
OLD_SPOTIFY = "https://open.spotify.com"
NEW_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"

# Replace ebook cover src with podcast logo src
# The ebook image appears as a base64 data URI for the ebook cover.
# We'll replace the entire img src with the Misfit logo path.
# The template uses {{EPISODE_IMAGE_URL}} which got filled with the ebook b64.
# We target the ep-artwork img tag and replace its src.

# We'll look for the ep-artwork class and replace whatever src is there
# with a link to the podcast cover image on Libsyn (always available)
PODCAST_COVER = "https://ssl-static.libsyn.com/p/assets/6/8/c/5/68c5b4f9c8f3a1b2/Misfit_Entrepreneur_Cover.jpg"

# Fallback: use a known good image from your RSS feed
# This is the standard Libsyn cover art URL pattern
LIBSYN_COVER = "https://assets.libsyn.com/img/misfit-entrepreneur-cover.jpg"

# Actually, safest approach: use your own site's logo
# which is already in the repo and served by Netlify
LOGO_PATH = "/favicon.ico"  # placeholder — will use inline SVG instead

print("=" * 55)
print(" Misfit Entrepreneur — Episode Pages Quick Fix")
print("=" * 55)

# Find all episode HTML files
pattern = os.path.join(EPISODES_DIR, "*.html")
files = glob.glob(pattern)

if not files:
    print(f"\n❌ No HTML files found in /{EPISODES_DIR}/")
    print("   Make sure this script runs from the repo root.")
    import sys; sys.exit(1)

print(f"\n✓ Found {len(files)} episode files")

spotify_fixed = 0
image_fixed = 0
errors = 0

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content
        changed = False

        # ── Fix 1: Spotify link ──────────────────────────────
        # Replace bare spotify.com href with the actual show URL
        # Only fix it if it's the generic homepage, not already correct
        if 'href="https://open.spotify.com"' in content:
            content = content.replace(
                'href="https://open.spotify.com"',
                'href="https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"'
            )
            spotify_fixed += 1
            changed = True

        # Also fix if it appears as text content of an anchor
        if '>Spotify<' in content and 'open.spotify.com/show' not in content:
            # Find the Spotify anchor and fix its href
            import re
            content = re.sub(
                r'href="https://open\.spotify\.com(?!/show)"',
                'href="https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"',
                content
            )
            changed = True

        # ── Fix 2: Remove broken ebook image, use logo ───────
        # The ebook base64 image is enormous — if it's there, replace
        # the ep-artwork img with the Misfit logo SVG placeholder
        if 'class="ep-artwork"' in content:
            import re

            # Check if src is a base64 data URI (ebook cover) vs a real URL
            artwork_match = re.search(
                r'<img[^>]+class="ep-artwork"[^>]*src="([^"]+)"[^>]*>',
                content
            )
            if not artwork_match:
                # Try reversed attribute order
                artwork_match = re.search(
                    r'<img[^>]+src="([^"]+)"[^>]*class="ep-artwork"[^>]*>',
                    content
                )

            if artwork_match:
                src = artwork_match.group(1)
                # If src is a base64 data URI or clearly not an episode image
                if src.startswith('data:image') or 'ebook' in src.lower():
                    # Replace with Misfit logo SVG inline — always works, no 404
                    logo_img = (
                        '<div class="ep-artwork" style="background:#0F0F0F;'
                        'display:flex;align-items:center;justify-content:center;'
                        'border-radius:8px;aspect-ratio:1;">'
                        '<svg viewBox="0 0 200 200" width="120" height="120" '
                        'xmlns="http://www.w3.org/2000/svg">'
                        '<rect width="200" height="200" fill="#0F0F0F"/>'
                        '<text x="100" y="90" text-anchor="middle" '
                        'font-family="Arial Black,sans-serif" font-size="52" '
                        'font-weight="900" fill="#F0B429">MIS</text>'
                        '<text x="100" y="148" text-anchor="middle" '
                        'font-family="Arial Black,sans-serif" font-size="52" '
                        'font-weight="900" fill="#F0B429">FIT</text>'
                        '<circle cx="100" cy="170" r="6" fill="#F0B429"/>'
                        '</svg></div>'
                    )

                    # Replace the img tag
                    old_img = artwork_match.group(0)
                    content = content.replace(old_img, logo_img, 1)
                    image_fixed += 1
                    changed = True

        # ── Write if changed ─────────────────────────────────
        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

    except Exception as e:
        print(f"  ❌ Error on {os.path.basename(filepath)}: {e}")
        errors += 1

print(f"\n{'='*55}")
print(f"✅ COMPLETE")
print(f"   Spotify links fixed : {spotify_fixed} files")
print(f"   Images fixed        : {image_fixed} files")
print(f"   Errors              : {errors} files")
print(f"{'='*55}")
