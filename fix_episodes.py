#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Full Site Fix v4
=======================================
Fix 1: Spotify links on all pages
Fix 2: Replace base64 ebook image src with podcast logo path
        Targets src="data:image..." directly — no regex, no tag matching.
"""

import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_SRC        = '/images/podcast-cover.jpg'

root_files    = glob.glob("*.html")
episode_files = glob.glob(os.path.join(EPISODES_DIR, "*.html"))
all_files     = root_files + episode_files

print(f"Files found: {len(root_files)} root, {len(episode_files)} episodes\n")

spotify_fixed = 0
image_fixed   = 0
errors        = 0

for filepath in all_files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        # ── Fix 1: Spotify ────────────────────────────────────
        new_content, n = re.subn(
            r'href="https://open\.spotify\.com(?!/show/2DAf0Yt9HedZSqoIBCliik)[^"]*"',
            f'href="{CORRECT_SPOTIFY}"',
            content
        )
        if n:
            content = new_content
            spotify_fixed += 1
            changed = True

        # ── Fix 2: Replace data:image src in episode pages ────
        # Find src="data:image..." and replace just the URI value
        # This targets the ebook base64 image directly — no tag parsing needed
        if is_episode:
            MARKER = 'src="data:image'
            if MARKER in content:
                idx = content.find(MARKER)
                while idx != -1:
                    # Find the closing quote of this src="..." attribute
                    val_start = idx + 5   # skip 'src="' to get to 'data:...'
                    val_end   = content.find('"', val_start)
                    if val_end != -1:
                        old_src   = content[idx : val_end + 1]
                        new_src   = f'src="{LOGO_SRC}"'
                        content   = content[:idx] + new_src + content[val_end + 1:]
                        image_fixed += 1
                        changed    = True
                        print(f"  ✓ Image replaced in: {os.path.basename(filepath)}")
                        break  # only one per file
                    idx = content.find(MARKER, idx + 1)

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
print(f"\nMake sure /images/podcast-cover.jpg is in the repo!")
