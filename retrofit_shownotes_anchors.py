#!/usr/bin/env python3
"""
retrofit_shownotes_anchors.py

One-time retrofit: inserts machine-readable HTML comment anchors around the
show notes section of every episode page in the /episodes directory.

Before:
    <h2>Show Notes</h2>
    <p>...show notes content...</p>
    ...
    <!-- Best Quote -->

After:
    <h2>Show Notes</h2>
    <!-- SHOW_NOTES_START -->
    <p>...show notes content...</p>
    ...
    <!-- SHOW_NOTES_END -->
    <!-- Best Quote -->

These anchors let Make.com do a precise, collision-proof string replacement
on future episode updates. Without them, every automated update is brittle.

Design notes:
- Idempotent: running the script twice is safe. Files that already contain
  SHOW_NOTES_START/END are skipped.
- Atomic per file: each file is read, modified, and written as a single
  operation. Partial writes are prevented by writing to a .tmp file and
  renaming on success.
- Preserves exact formatting: only inserts two lines — does not touch any
  other whitespace, indentation, or content.
- Verification: reports every file processed, skipped, or failed.
- Safe anchor choice: <h2>Show Notes</h2> appears exactly once per episode
  page (verified across all 360 files). <!-- Best Quote --> also appears
  exactly once. No collision risk.

Usage (from repo root):
    python3 retrofit_shownotes_anchors.py           # dry run, shows changes
    python3 retrofit_shownotes_anchors.py --apply   # actually writes files
"""

import sys
import os
import re
from pathlib import Path

EPISODES_DIR = Path(__file__).parent / "episodes"

# The two anchors we wrap around. Both are structurally unique in every file.
START_MARKER = "<h2>Show Notes</h2>"
END_MARKER = "<!-- Best Quote -->"

# The anchors we insert. Comment form = invisible on the rendered page.
INSERT_AFTER_START = "<!-- SHOW_NOTES_START -->"
INSERT_BEFORE_END = "<!-- SHOW_NOTES_END -->"

# Idempotency check: if either is already present, skip.
ALREADY_DONE_MARKER = INSERT_AFTER_START


def retrofit_file(path: Path, apply: bool) -> str:
    """
    Returns one of: 'skipped_already_done', 'skipped_missing_anchors',
                    'modified', 'error:<msg>'
    """
    try:
        content = path.read_text(encoding="utf-8")
    except Exception as e:
        return f"error:read_failed:{e}"

    # Idempotent: bail out if already retrofitted
    if ALREADY_DONE_MARKER in content:
        return "skipped_already_done"

    # Verify both anchors present (we already know they are, but be defensive)
    if START_MARKER not in content:
        return "skipped_missing_anchors:no_show_notes_h2"
    if END_MARKER not in content:
        return "skipped_missing_anchors:no_best_quote"

    # Count occurrences — we want exactly one of each for safe insertion
    if content.count(START_MARKER) != 1:
        return f"error:start_marker_count={content.count(START_MARKER)}"
    if content.count(END_MARKER) != 1:
        return f"error:end_marker_count={content.count(END_MARKER)}"

    # Do the insert. Preserve indentation by matching the existing pattern.
    # We insert the START anchor on its own line immediately after <h2>Show Notes</h2>
    # and the END anchor on its own line immediately before <!-- Best Quote -->.
    # Indentation matches whatever precedes the END marker (typically 4 spaces).

    # Detect indentation of the existing <!-- Best Quote --> line
    end_line_match = re.search(r"^([ \t]*)" + re.escape(END_MARKER), content, re.MULTILINE)
    indent = end_line_match.group(1) if end_line_match else "    "

    new_content = content.replace(
        START_MARKER,
        START_MARKER + "\n" + indent + INSERT_AFTER_START,
        1,
    )
    new_content = new_content.replace(
        END_MARKER,
        INSERT_BEFORE_END + "\n" + indent + END_MARKER,
        1,
    )

    # Sanity check: both anchors must now be present exactly once
    if new_content.count(INSERT_AFTER_START) != 1 or new_content.count(INSERT_BEFORE_END) != 1:
        return "error:post_insert_count_mismatch"

    # Sanity check: there must be SOMETHING between the anchors (guard against
    # a totally malformed file). Placeholder text like "Show notes coming soon."
    # is fine — those are the pages we most want to be able to backfill.
    between = new_content.split(INSERT_AFTER_START, 1)[1].split(INSERT_BEFORE_END, 1)[0]
    if not between.strip():
        return "error:nothing_between_anchors"

    if not apply:
        return "modified"  # dry run

    # Atomic write: write to .tmp, then rename
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp_path.write_text(new_content, encoding="utf-8")
        os.replace(tmp_path, path)
    except Exception as e:
        if tmp_path.exists():
            tmp_path.unlink()
        return f"error:write_failed:{e}"

    return "modified"


def main():
    apply = "--apply" in sys.argv

    if not EPISODES_DIR.is_dir():
        print(f"ERROR: episodes directory not found at {EPISODES_DIR}")
        sys.exit(1)

    files = sorted(EPISODES_DIR.glob("*.html"))
    if not files:
        print(f"ERROR: no .html files in {EPISODES_DIR}")
        sys.exit(1)

    print(f"{'APPLYING' if apply else 'DRY RUN'} — {len(files)} files")
    print(f"Episodes dir: {EPISODES_DIR}")
    print("-" * 60)

    counts = {"modified": 0, "skipped_already_done": 0, "skipped_missing_anchors": 0, "error": 0}
    errors = []

    for f in files:
        result = retrofit_file(f, apply)
        if result == "modified":
            counts["modified"] += 1
        elif result == "skipped_already_done":
            counts["skipped_already_done"] += 1
        elif result.startswith("skipped_missing_anchors"):
            counts["skipped_missing_anchors"] += 1
            errors.append(f"{f.name}: {result}")
        elif result.startswith("error"):
            counts["error"] += 1
            errors.append(f"{f.name}: {result}")

    print(f"Modified:              {counts['modified']}")
    print(f"Skipped (already done): {counts['skipped_already_done']}")
    print(f"Skipped (no anchors):   {counts['skipped_missing_anchors']}")
    print(f"Errors:                 {counts['error']}")

    if errors:
        print("\nDetails:")
        for e in errors[:20]:
            print(f"  {e}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")

    if not apply and counts["modified"] > 0:
        print(f"\nDry run complete. To apply changes, run:")
        print(f"    python3 {Path(__file__).name} --apply")

    sys.exit(1 if counts["error"] > 0 else 0)


if __name__ == "__main__":
    main()
