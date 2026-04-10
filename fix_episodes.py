#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Targeted Fix (confirmed from deep diagnostic)
===================================================================
Header logo  → pos ~12,906: class="logo"><img src="/images/podcast-cover.jpg"
ep-artwork   → pos ~14,897: ep-sidebar a1 > img src="data:image/jpeg (FIRST after </header>)
Meta OG tag  → pos ~552:    IGNORED (was causing all previous failures)
"""
import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_SRC        = "/images/podcast-cover.jpg"

try:
    with open("logo_b64.txt", "r") as f:
        logo_b64 = f.read().strip()
    img_type = "png" if logo_b64.startswith("iVBOR") else "jpeg"
    print(f"logo_b64.txt OK  ({len(logo_b64):,} chars, type={img_type})")
except FileNotFoundError:
    print("ERROR: logo_b64.txt not found"); exit(1)

episode_files = glob.glob(os.path.join(EPISODES_DIR, "*.html"))
all_files     = glob.glob("*.html") + episode_files
print(f"Files: {len(glob.glob('*.html'))} root  |  {len(episode_files)} episodes\n")

header_fixed = image_fixed = spotify_fixed = errors = 0

for filepath in all_files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        if is_episode:
            # ── Fix 1: Header logo ────────────────────────────
            # Unique anchor: class="logo"><img src="
            # Replace only the src VALUE, leaving all other attributes intact
            HEADER_ANCHOR = 'class="logo"><img src="'
            idx = content.find(HEADER_ANCHOR)
            if idx != -1:
                val_start = idx + len(HEADER_ANCHOR)
                val_end   = content.find('"', val_start)
                if val_end != -1:
                    current_val = content[val_start:val_end]
                    if current_val != f'data:image/{img_type};base64,{logo_b64}':
                        content      = (content[:val_start]
                                        + f'data:image/{img_type};base64,{logo_b64}'
                                        + content[val_end:])
                        header_fixed += 1
                        changed      = True

            # ── Fix 2: ep-artwork ─────────────────────────────
            # Search AFTER </header> to skip the meta OG tag and header area
            header_end = content.find('</header>')
            search_from = header_end + 9 if header_end != -1 else 13300

            MARKER = 'src="data:image/jpeg'
            idx = content.find(MARKER, search_from)
            if idx != -1:
                val_end = content.find('"', idx + 5)
                if val_end != -1:
                    content     = content[:idx] + f'src="{LOGO_SRC}"' + content[val_end+1:]
                    image_fixed += 1
                    changed     = True

        # ── Fix 3: Spotify (all pages) ────────────────────────
        new_content, n = re.subn(
            r'href="https://open\.spotify\.com(?!/show/2DAf0Yt9HedZSqoIBCliik)[^"]*"',
            f'href="{CORRECT_SPOTIFY}"', content)
        if n:
            content = new_content; spotify_fixed += 1; changed = True

        if changed:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)

    except Exception as e:
        print(f"  ERR {filepath}: {e}"); errors += 1

print(f"Header logos restored : {header_fixed}")
print(f"ep-artwork fixed      : {image_fixed}")
print(f"Spotify fixed         : {spotify_fixed}")
print(f"Errors                : {errors}")
