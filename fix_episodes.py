#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Debug + Fix
Prints exactly what it finds in the first 3 episode files before attempting fixes.
"""
import os, re, glob

EPISODES_DIR    = "episodes"
CORRECT_SPOTIFY = "https://open.spotify.com/show/2DAf0Yt9HedZSqoIBCliik"
LOGO_SRC        = "/images/podcast-cover.jpg"

try:
    with open("logo_b64.txt", "r") as f:
        logo_b64 = f.read().strip()
    img_type     = "png" if logo_b64.startswith("iVBOR") else "jpeg"
    LOGO_B64_SRC = f'src="data:image/{img_type};base64,{logo_b64}"'
    print(f"logo_b64.txt OK  ({len(logo_b64):,} chars, type={img_type})")
except FileNotFoundError:
    print("ERROR: logo_b64.txt not found — aborting"); exit(1)

episode_files = sorted(glob.glob(os.path.join(EPISODES_DIR, "*.html")))
all_files     = glob.glob("*.html") + episode_files
print(f"Files: {len(glob.glob('*.html'))} root  |  {len(episode_files)} episodes\n")

# ── DEBUG: inspect first 3 episode files ──────────────
print("=" * 60)
print("DEBUG — first 3 episode files")
print("=" * 60)
for fp in episode_files[:3]:
    with open(fp, "r", encoding="utf-8") as f:
        c = f.read()
    print(f"\n{fp}  ({len(c):,} chars)")
    checks = [
        'src="/images/podcast-cover.jpg"',
        "src='/images/podcast-cover.jpg'",
        'src="data:image/jpeg',
        'src="data:image/png',
        'class="ep-artwork"',
        '">\n',
    ]
    for ch in checks:
        idx = c.find(ch)
        print(f"  {repr(ch):45s} → pos {idx}")
    # Show 120 chars around first podcast-cover or data:image occurrence
    for needle in ['podcast-cover', 'data:image']:
        idx = c.find(needle)
        if idx != -1:
            snip = repr(c[max(0,idx-30):idx+80])
            print(f"  Context '{needle}': {snip}")
print("=" * 60)
print()

# ── FIX ───────────────────────────────────────────────
header_fixed = image_fixed = artifact_fixed = spotify_fixed = errors = 0

for filepath in all_files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        changed    = False
        is_episode = filepath.startswith(EPISODES_DIR)

        if is_episode:
            # Step 1: restore header logo (handles both relative and absolute URL)
            for marker in ['src="/images/podcast-cover.jpg"',
                           "src='/images/podcast-cover.jpg'",
                           'src="https://misfit-entrepreneur-site.netlify.app/images/podcast-cover.jpg"']:
                if marker in content:
                    content      = content.replace(marker, LOGO_B64_SRC, 1)
                    header_fixed += 1
                    changed      = True
                    break

            # Step 2: fix ep-artwork (only remaining data:image after step 1)
            if 'src="data:image' in content:
                idx = content.find('src="data:image')
                val_end = content.find('"', idx + 5)
                if val_end != -1:
                    content     = content[:idx] + f'src="{LOGO_SRC}"' + content[val_end+1:]
                    image_fixed += 1
                    changed     = True

            # Step 3: remove "> artifact
            before  = content
            content = re.sub(r'\n">\n', '\n', content)
            content = re.sub(r'\n">\r\n', '\n', content)
            if content != before:
                artifact_fixed += 1
                changed = True

        # Step 4: Spotify
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

print(f"Header restored : {header_fixed}")
print(f"ep-artwork fixed: {image_fixed}")
print(f"Artifacts fixed : {artifact_fixed}")
print(f"Spotify fixed   : {spotify_fixed}")
print(f"Errors          : {errors}")
