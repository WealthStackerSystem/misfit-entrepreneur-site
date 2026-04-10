#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Full Site Fix v5
=======================================
Fix 1: Spotify links on all pages
Fix 2: Replace ONLY the ep-artwork src (searches backward from class="ep-artwork")
        This correctly targets the sidebar image, not the header logo.

Key insight: search BACKWARD from class="ep-artwork" to find its src attribute.
This is 100% safe — it cannot accidentally hit the header logo.
"""

import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_SRC        = '/images/podcast-cover.jpg'

root_files    = glob.glob("*.html")
episode_files = glob.glob(os.path.join(EPISODES_DIR, "*.html"))
all_files     = root_files + episode_files

print(f"Files: {len(root_files)} root, {len(episode_files)} episodes\n")

spotify_fixed = 0
image_fixed   = 0
errors        = 0

for filepath in all_files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        # ── Fix 1: Spotify links on ALL pages ─────────────────
        new_content, n = re.subn(
            r'href="https://open\.spotify\.com(?!/show/2DAf0Yt9HedZSqoIBCliik)[^"]*"',
            f'href="{CORRECT_SPOTIFY}"',
            content
        )
        if n:
            content = new_content
            spotify_fixed += 1
            changed = True

        # ── Fix 2: ep-artwork ONLY — backward search ──────────
        # The ep-artwork img tag looks like:
        #   <img src="data:image/..." alt="..." class="ep-artwork">
        # We find class="ep-artwork" then walk BACKWARD to find src="
        # This guarantees we never touch the header logo.

        if is_episode:
            class_marker = 'class="ep-artwork"'
            idx = content.find(class_marker)
            if idx != -1:
                # Walk backward from class="ep-artwork" to find src="
                src_pos = content.rfind('src="', 0, idx)
                if src_pos != -1:
                    val_start = src_pos + 5       # position after src="
                    val_end   = content.find('"', val_start)
                    if val_end != -1:
                        current_val = content[val_start:val_end]
                        # Only replace if it's still a data URI (not already fixed)
                        if current_val.startswith('data:image'):
                            content = (content[:val_start]
                                       + LOGO_SRC
                                       + content[val_end:])
                            image_fixed += 1
                            changed = True
                            print(f"  ✓ Fixed: {os.path.basename(filepath)}")
                        else:
                            print(f"  — Already fixed: {os.path.basename(filepath)}")

        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

    except Exception as e:
        print(f"  ❌ {filepath}: {e}")
        errors += 1

print(f"\n{'='*50}")
print(f"Spotify fixed : {spotify_fixed}")
print(f"Images fixed  : {image_fixed}")
print(f"Errors        : {errors}")
print(f"{'='*50}")
