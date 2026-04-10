#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Combined Header + ep-artwork Fix
=======================================================
Step 1: Restore header logo from logo_b64.txt
Step 2: Fix ep-artwork sidebar image
Step 3: Remove "> artifact
Step 4: Fix Spotify links
"""

import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_SRC        = "/images/podcast-cover.jpg"

# Load logo_b64.txt
try:
    with open("logo_b64.txt", "r") as f:
        logo_b64 = f.read().strip()
    img_type = "png" if logo_b64.startswith("iVBOR") else "jpeg"
    LOGO_B64_SRC = f'src="data:image/{img_type};base64,{logo_b64}"'
    print(f"logo_b64.txt loaded ({len(logo_b64):,} chars, type={img_type})")
except FileNotFoundError:
    print("ERROR: logo_b64.txt not found in repo root — aborting")
    exit(1)

root_files    = glob.glob("*.html")
episode_files = glob.glob(os.path.join(EPISODES_DIR, "*.html"))
all_files     = root_files + episode_files

print(f"Files: {len(root_files)} root  |  {len(episode_files)} episodes\n")

header_fixed   = 0
image_fixed    = 0
artifact_fixed = 0
spotify_fixed  = 0
errors         = 0

for filepath in all_files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        if is_episode:
            # Step 1: Restore header logo
            # Currently the header has src="/images/podcast-cover.jpg" (wrong)
            # ep-artwork still has src="data:image/jpeg;base64,[ebook]"
            # So the only src="/images/podcast-cover.jpg" is the header.
            HEADER_MARKER = 'src="/images/podcast-cover.jpg"'
            if HEADER_MARKER in content:
                content      = content.replace(HEADER_MARKER, LOGO_B64_SRC, 1)
                header_fixed += 1
                changed      = True

            # Step 2: Fix ep-artwork
            # After step 1, header has base64 logo.
            # The only remaining src="data:image" is the ebook ep-artwork.
            MARKER = 'src="data:image'
            if MARKER in content:
                idx     = content.find(MARKER)
                val_end = content.find('"', idx + 5)
                if val_end != -1:
                    content     = content[:idx] + f'src="{LOGO_SRC}"' + content[val_end + 1:]
                    image_fixed += 1
                    changed     = True

            # Step 3: Remove "> artifact
            before  = content
            content = re.sub(r'\n">\n', '\n', content)
            content = re.sub(r'\n">\r\n', '\n', content)
            if content != before:
                artifact_fixed += 1
                changed = True

        # Step 4: Spotify links (all pages)
        new_content, n = re.subn(
            r'href="https://open\.spotify\.com(?!/show/2DAf0Yt9HedZSqoIBCliik)[^"]*"',
            f'href="{CORRECT_SPOTIFY}"',
            content,
        )
        if n:
            content       = new_content
            spotify_fixed += 1
            changed       = True

        if changed:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)

    except Exception as e:
        print(f"  ERR {filepath}: {e}")
        errors += 1

print(f"\n{'='*50}")
print(f"Header logos restored : {header_fixed}")
print(f"ep-artwork fixed      : {image_fixed}")
print(f"Artifacts removed     : {artifact_fixed}")
print(f"Spotify fixed         : {spotify_fixed}")
print(f"Errors                : {errors}")
print(f"{'='*50}")
