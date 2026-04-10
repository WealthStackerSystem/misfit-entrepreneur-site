#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Full Site Fix v3
=======================================
Fixes across ALL HTML files:
  1. Spotify link -> correct show URL (root pages + episodes)
  2. ep-artwork image -> podcast logo (episode pages)
     Uses string-based approach — works even on multi-line img tags.

REQUIREMENT: Upload podcast-cover.jpg to /images/ folder in repo first.
"""

import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_PATH       = "/images/podcast-cover.jpg"
LOGO_IMG        = f'<img src="{LOGO_PATH}" alt="Misfit Entrepreneur Podcast" class="ep-artwork" style="width:100%;border-radius:8px;display:block;">'

print("=" * 55)
print(" Misfit Entrepreneur — Full Site Fix v3")
print("=" * 55)

root_files    = glob.glob("*.html")
episode_files = glob.glob(os.path.join(EPISODES_DIR, "*.html"))
all_files     = root_files + episode_files

print(f"\n✓ Root pages    : {len(root_files)}")
print(f"✓ Episode pages : {len(episode_files)}")
print(f"✓ Total         : {len(all_files)}\n")

spotify_fixed = 0
image_fixed   = 0
errors        = 0

for filepath in all_files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        # ── Fix 1: Spotify link on ALL pages ─────────────────
        new_content, n = re.subn(
            r'href="https://open\.spotify\.com(?!/show/2DAf0Yt9HedZSqoIBCliik)[^"]*"',
            f'href="{CORRECT_SPOTIFY}"',
            content
        )
        if n:
            content = new_content
            spotify_fixed += 1
            changed = True

        # ── Fix 2: Episode pages — replace ep-artwork img ────
        # Uses string operations to handle multi-line base64 img tags
        if is_episode and 'class="ep-artwork"' in content:
            idx = content.find('class="ep-artwork"')
            if idx != -1:
                # Walk backward to find <img
                start = content.rfind('<img', 0, idx)
                if start != -1:
                    # Walk forward to find closing >
                    end = content.find('>', idx)
                    if end != -1:
                        end += 1  # include the >
                        old_tag = content[start:end]
                        # Only replace if it's a data URI or broken SVG div
                        if 'data:image' in old_tag or old_tag.startswith('<div'):
                            content = content[:start] + LOGO_IMG + content[end:]
                            image_fixed += 1
                            changed = True
                            print(f"  ✓ Image fixed: {filepath}")

                # Also clean up any broken <div class="ep-artwork"...> from previous runs
                elif content.find('<div class="ep-artwork"') != -1:
                    div_start = content.find('<div class="ep-artwork"')
                    # Find the matching </div>
                    div_end = content.find('</div>', div_start)
                    if div_end != -1:
                        div_end += 6  # len('</div>')
                        content = content[:div_start] + LOGO_IMG + content[div_end:]
                        image_fixed += 1
                        changed = True
                        print(f"  ✓ Div cleaned: {filepath}")

        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

    except Exception as e:
        print(f"  ❌ {filepath}: {e}")
        errors += 1

print(f"\n{'='*55}")
print(f"✅ COMPLETE")
print(f"   Spotify fixed : {spotify_fixed} files")
print(f"   Images fixed  : {image_fixed} episode files")
print(f"   Errors        : {errors}")
print(f"{'='*55}")
print(f"\nNOTE: Make sure /images/podcast-cover.jpg is in the repo.")
