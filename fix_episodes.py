#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Full Site Quick Fix v2
=============================================
Fixes across ALL HTML files:
  1. Spotify link -> correct show URL (root pages + episodes)
  2. Cleans up broken SVG from previous run
  3. Replaces ebook cover with podcast logo image (episode pages)
"""

import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_PATH       = "/images/podcast-cover.jpg"

# Clean replacement img tag
LOGO_IMG = f'<img src="{LOGO_PATH}" alt="Misfit Entrepreneur Podcast" class="ep-artwork" style="width:100%;border-radius:8px;display:block;">'

print("=" * 55)
print(" Misfit Entrepreneur — Full Site Fix v2")
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

        # ── Fix 2: Episode pages — clean image area ──────────
        if is_episode:

            # Case A: Previous broken run left a <div class="ep-artwork"...>
            # with SVG inside (the "> and FIT text visible on screen)
            # Match the div and everything inside up to its closing </div>
            broken_div, n1 = re.subn(
                r'<div class="ep-artwork"[^>]*>.*?</div>',
                LOGO_IMG,
                content,
                count=1,
                flags=re.DOTALL
            )
            if n1:
                content = broken_div
                image_fixed += 1
                changed = True

            # Case B: Still has the original <img class="ep-artwork" src="data:...">
            # Match even if src is a massive base64 blob (use DOTALL to be safe)
            elif 'class="ep-artwork"' in content:
                # Match img tag with ep-artwork class regardless of attribute order
                img_tag, n2 = re.subn(
                    r'<img(?=[^>]*class="ep-artwork")[^>]*>',
                    LOGO_IMG,
                    content,
                    count=1,
                    flags=re.DOTALL
                )
                if n2:
                    content = img_tag
                    image_fixed += 1
                    changed = True

        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  ✓ {filepath}")

    except Exception as e:
        print(f"  ❌ {filepath}: {e}")
        errors += 1

print(f"\n{'='*55}")
print(f"✅ COMPLETE")
print(f"   Spotify fixed : {spotify_fixed} files")
print(f"   Images fixed  : {image_fixed} episode files")
print(f"   Errors        : {errors}")
print(f"{'='*55}")
print(f"\nNOTE: Make sure /images/podcast-cover.jpg is in your repo root.")
