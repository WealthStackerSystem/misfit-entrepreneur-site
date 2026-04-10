#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Deep Diagnostic
Shows ALL occurrences of key strings with full context.
NO file changes.
"""
import os, re, glob

EPISODES_DIR = "episodes"
episode_files = sorted(glob.glob(os.path.join(EPISODES_DIR, "*.html")))
print(f"Episode files: {len(episode_files)}\n")

fp = episode_files[0]
with open(fp, "r", encoding="utf-8") as f:
    content = f.read()

print(f"File: {fp}  ({len(content):,} chars)\n")

def find_all(text, needle):
    positions = []
    start = 0
    while True:
        idx = text.find(needle, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + 1
    return positions

# Find ALL occurrences of key strings
needles = [
    'src="/images/podcast-cover.jpg"',
    'src="data:image',
    'podcast-cover',
    '<header',
    '</header>',
    'class="logo',
    'class="site-logo',
    'alt="Misfit Entrepreneur"',
    'alt="Misfit Entrepreneur Podcast"',
    '<img',
]

for needle in needles:
    positions = find_all(content, needle)
    print(f"'{needle}'  → {len(positions)} occurrences at: {positions[:10]}")
    for pos in positions[:5]:
        snip = content[max(0,pos-40):pos+100]
        print(f"    [{pos}] {repr(snip)}")
    print()
