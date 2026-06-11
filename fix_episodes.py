#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — One-time episode page fixer
==================================================
Patches all existing /episodes/*.html files in place:
  1. Dead links:  href="/truths/"  →  href="/code"
  2. Misfit Code callout image: podcast cover → book mockup
     (targets ONLY the img with alt="The Misfit Code")

Run via GitHub Action (fix-episode-pages.yml) or locally:
  python3 fix_episode_pages.py
"""

import os
import glob

EPISODES_DIR = "episodes"
OLD_LINK = 'href="/truths/"'
NEW_LINK = 'href="/code"'
OLD_IMG = '<img src="/images/podcast-cover.jpg" alt="The Misfit Code"'
NEW_IMG = '<img src="/images/misfit-code-book.jpg" alt="The Misfit Code"'


def main():
    files = sorted(glob.glob(os.path.join(EPISODES_DIR, "*.html")))
    if not files:
        print(f"❌ No HTML files found in /{EPISODES_DIR}/")
        return

    print(f"🔧 Patching {len(files)} episode pages...\n")
    links_fixed = 0
    imgs_fixed = 0
    files_changed = 0

    for path in files:
        with open(path, "r", encoding="utf-8") as f:
            html = f.read()

        original = html
        n_links = html.count(OLD_LINK)
        n_imgs = html.count(OLD_IMG)
        html = html.replace(OLD_LINK, NEW_LINK)
        html = html.replace(OLD_IMG, NEW_IMG)

        if html != original:
            with open(path, "w", encoding="utf-8") as f:
                f.write(html)
            links_fixed += n_links
            imgs_fixed += n_imgs
            files_changed += 1

    print(f"✅ Done.")
    print(f"   Files changed: {files_changed}/{len(files)}")
    print(f"   Links fixed:   {links_fixed}")
    print(f"   Images fixed:  {imgs_fixed}")

    if files_changed == 0:
        print("   (Nothing to change — pages may already be patched.)")


if __name__ == "__main__":
    main()
