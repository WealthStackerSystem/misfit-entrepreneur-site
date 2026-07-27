#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR - Blog Archive Scraper (v3, Wayback)
=========================================================
The original Weebly blog is offline. Both hostnames now serve the new
Netlify site, so the archive only exists in the Wayback Machine.

The first scraper used Wayback too, but its selectors were written for
WordPress markup and matched nothing in Weebly's HTML, which is why the
imported posts came out as stubs.

This version:
  - pulls the newest good capture of each post, not the oldest
  - requests the raw original bytes so Wayback's toolbar is never in the way
  - extracts content by finding the densest text block rather than guessing
    at class names
  - prints the real markup of the first post so extraction can be verified

Writes blog_archive.json. Does not touch the existing /blog/*.html pages.
"""

import json
import re
import sys
import time
import html as htmllib
from collections import defaultdict

import requests
from bs4 import BeautifulSoup

CDX = "https://web.archive.org/cdx/search/cdx"
WB = "https://web.archive.org/web/"
SITE = "misfitentrepreneur.com/blog/"
OUT = "blog_archive.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

NON_POST = ("archives", "category", "tag", "page", "author", "feed", "rss",
            "comments", "search")

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def fetch(url, tries=3, pause=3):
    """Return (status, text). Wayback rate limits, so be patient."""
    status = None
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=45, allow_redirects=True)
            status = r.status_code
            if r.status_code == 200:
                return 200, r.text
            if r.status_code == 404:
                return 404, None
            # 429 and 5xx are worth waiting out
            time.sleep(pause * (i + 2))
        except Exception as e:
            print("      transport: %s" % e)
            time.sleep(pause * (i + 2))
    return status, None


def is_post_path(url):
    if "/blog/" not in url:
        return False
    tail = url.split("/blog/", 1)[1].strip("/")
    if not tail or "?" in tail or "#" in tail:
        return False
    first = tail.split("/")[0].lower()
    if first in NON_POST:
        return False
    if re.fullmatch(r"\d+", first):
        return False
    return True


def get_captures():
    """Newest good capture per unique post URL."""
    params = {
        "url": SITE + "*",
        "output": "json",
        "fl": "original,timestamp,statuscode",
        "filter": "statuscode:200",
        "matchType": "prefix",
        "limit": "20000",
    }

    print("Querying Wayback CDX index")
    try:
        r = SESSION.get(CDX, params=params, timeout=90)
        print("  status %s, %d bytes" % (r.status_code, len(r.text)))
        if r.status_code != 200:
            print("  body: %s" % r.text[:200])
            return {}
        rows = r.json()
    except Exception as e:
        print("  CDX failed: %s" % e)
        return {}

    if not rows or len(rows) < 2:
        print("  CDX returned no rows")
        return {}

    print("  %d capture rows" % (len(rows) - 1))

    by_url = defaultdict(list)
    for row in rows[1:]:
        original, timestamp = row[0], row[1]
        if not is_post_path(original):
            continue
        slug = original.rstrip("/").split("/")[-1].lower()
        by_url[slug].append((timestamp, original))

    latest = {}
    for slug, caps in by_url.items():
        caps.sort()
        latest[slug] = caps[-1]  # newest timestamp

    print("  %d unique posts\n" % len(latest))
    return latest


def clean_text(s):
    return re.sub(r"\s+", " ", htmllib.unescape(s or "")).strip()


DATE_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b"
)
MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11,
    "December": 12,
}

STRIP_TAGS = ["script", "style", "form", "iframe", "noscript", "svg",
              "nav", "footer", "header"]

JUNK_ATTR = re.compile(
    r"wm-ipp|wayback|donato|sidebar|share|social|comment|nav|menu|footer|"
    r"header|banner|subscribe|archive|categor|rss|wsite-nav|wsite-header|"
    r"wsite-footer|blog-sidebar|blog-header",
    re.I,
)


def scrub(soup):
    for t in STRIP_TAGS:
        for n in soup.find_all(t):
            n.decompose()
    for n in soup.find_all(attrs={"id": JUNK_ATTR}):
        n.decompose()
    for n in soup.find_all(attrs={"class": JUNK_ATTR}):
        n.decompose()
    return soup


def densest_block(soup):
    """
    Weebly markup varies across template versions, so rather than guessing
    class names, score every container by how much of its text sits in
    paragraph-like children and take the best one.
    """
    best = None
    best_score = 0

    for node in soup.find_all(["div", "article", "section"]):
        text = node.get_text(" ", strip=True)
        n = len(text)
        if n < 200:
            continue

        # prefer nodes that are mostly text, not wrappers full of markup
        link_text = sum(len(a.get_text(" ", strip=True))
                        for a in node.find_all("a"))
        if n > 0 and link_text / n > 0.4:
            continue

        depth = len(list(node.parents))
        score = n - depth * 40  # favour deeper, tighter containers

        if score > best_score:
            best_score = score
            best = node

    return best


def describe_markup(soup):
    """One-time dump so the real Weebly structure is visible in the log."""
    print("\n  --- markup sample -------------------------------------")
    rows = []
    for node in soup.find_all(["div", "article", "section"]):
        text = node.get_text(" ", strip=True)
        if len(text) < 200:
            continue
        cls = " ".join(node.get("class", []))[:50]
        nid = (node.get("id") or "")[:30]
        rows.append((len(text), node.name, cls, nid))
    rows.sort(reverse=True)
    for n, tag, cls, nid in rows[:12]:
        print("   %6d  %-8s class=%-50s id=%s" % (n, tag, cls, nid))
    print("  -------------------------------------------------------\n")


def main():
    captures = get_captures()

    if not captures:
        print("No captures found. Aborting.")
        sys.exit(1)

    posts = []
    failures = []
    described = False

    items = sorted(captures.items())

    for i, (slug, (ts, original)) in enumerate(items, 1):
        # id_ returns the archived bytes without Wayback's injected toolbar
        url = WB + ts + "id_/" + original
        print("[%d/%d] %s (%s)" % (i, len(items), slug, ts[:8]))

        status, raw = fetch(url)
        if not raw:
            print("      status %s" % status)
            failures.append(slug)
            continue

        soup = scrub(BeautifulSoup(raw, "html.parser"))

        if not described:
            describe_markup(soup)
            described = True

        # title
        title = None
        for sel in ["h2.blog-title", ".blog-title", "h1", "h2"]:
            node = soup.select_one(sel)
            if node:
                t = clean_text(node.get_text(" ", strip=True))
                if t and len(t) > 3:
                    title = t
                    break
        if not title and soup.title:
            title = re.sub(r"\s*[-|]\s*Misfit Entrepreneur.*$", "",
                           clean_text(soup.title.get_text())).strip()
        if not title:
            title = slug.replace("-", " ").title()

        # date
        date = None
        m = DATE_RE.search(raw)
        if m:
            date = "%04d-%02d-%02d" % (
                int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))

        # body
        block = densest_block(soup)
        body_html = str(block) if block else ""
        plain = clean_text(
            BeautifulSoup(body_html, "html.parser").get_text(" ")) if body_html else ""
        words = len(plain.split()) if plain else 0

        if words < 60:
            print("      thin (%d words), skipped" % words)
            failures.append(slug)
            continue

        print("      ok  %d words  %s" % (words, title[:55]))

        posts.append({
            "slug": slug,
            "url": original,
            "wayback": url,
            "title": title,
            "date": date,
            "body_html": body_html,
            "plain": plain,
            "word_count": words,
        })

        time.sleep(1.2)  # Wayback is strict about rate

    posts.sort(key=lambda p: p["date"] or "0000-00-00")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=1, ensure_ascii=False)

    wc = [p["word_count"] for p in posts] or [0]
    dated = sum(1 for p in posts if p["date"])

    print("\n" + "=" * 60)
    print("Posts captured   : %d" % len(posts))
    print("With a date      : %d" % dated)
    print("Words min/avg/max: %d / %d / %d" % (
        min(wc), sum(wc) // len(wc), max(wc)))
    print("Skipped/failed   : %d" % len(failures))
    if failures:
        print("  " + ", ".join(failures[:30]))
    print("Written to       : %s" % OUT)

    if not posts:
        sys.exit(1)


if __name__ == "__main__":
    main()
