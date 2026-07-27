#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR - Live Blog Archive Scraper (v2)
=====================================================
The original blog is still live on Weebly at www.misfitentrepreneur.com/blog/.

v1 found nothing and could not say why, because it swallowed HTTP status
codes. v2 runs a diagnostic probe first and logs every status code, so a
failure tells us exactly what is happening.

  0. Probe a few known URLs and report status, size, and a body snippet
  1. Enumerate post URLs from sitemap.xml
  2. Fall back to crawling /blog/archives/MM-YYYY across the full date range
  3. Fetch each post and extract title, date, and full body
  4. Write blog_archive.json

Data only. Does not touch the existing /blog/*.html pages.
"""

import json
import re
import sys
import time
import html as htmllib
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HOSTS = [
    "https://www.misfitentrepreneur.com",
    "https://misfitentrepreneur.com",
]
OUT = "blog_archive.json"

# Weebly and the CDN in front of it reject obvious bot agents.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}

NON_POST = ("archives", "category", "tag", "page", "author", "feed", "rss")

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

BASE = None  # resolved by the probe


def fetch(url, tries=2, quiet=False):
    """Return (status, text). status is None on a transport error."""
    last_status = None
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=30, allow_redirects=True)
            last_status = r.status_code
            if r.status_code == 200:
                return 200, r.text
            if r.status_code == 404:
                return 404, None
        except Exception as e:
            if not quiet:
                print("    transport error: %s" % e)
            last_status = None
        if i + 1 < tries:
            time.sleep(2)
    return last_status, None


def probe():
    """Work out which host answers, and report exactly what we get back."""
    global BASE

    print("=" * 60)
    print("DIAGNOSTIC PROBE")
    print("=" * 60)

    candidates = []
    for host in HOSTS:
        candidates.append((host, host + "/blog/archives/07-2020"))
        candidates.append((host, host + "/sitemap.xml"))
        candidates.append((host, host + "/blog"))

    working_host = None

    for host, url in candidates:
        status, text = fetch(url, tries=1, quiet=True)
        size = len(text) if text else 0
        print("  %-6s %6s  %s" % (str(status), size, url))

        if status == 200 and text:
            snippet = re.sub(r"\s+", " ", text[:180])
            print("         %s" % snippet)
            if working_host is None:
                working_host = host

    print()

    if working_host is None:
        print("Nothing responded with 200. The site is blocking these requests")
        print("or is unreachable from this runner.")
        return False

    BASE = working_host
    print("Using host: %s" % BASE)
    print()
    return True


def is_post_url(u):
    if "/blog/" not in u:
        return False
    tail = u.split("/blog/", 1)[1].strip("/")
    if not tail or "?" in tail or "#" in tail:
        return False
    if tail.split("/")[0].lower() in NON_POST:
        return False
    return True


def urls_from_sitemap():
    found = set()

    status, xml = fetch(BASE + "/sitemap.xml")
    print("  sitemap.xml -> %s" % status)
    if not xml:
        return found

    soup = BeautifulSoup(xml, "html.parser")

    child = [
        loc.get_text(strip=True)
        for sm in soup.find_all("sitemap")
        for loc in sm.find_all("loc")
    ]

    if child:
        print("  sitemap index, %d child maps" % len(child))
        for cm in child:
            st, sub = fetch(cm)
            if not sub:
                print("    %s -> %s" % (cm, st))
                continue
            for loc in BeautifulSoup(sub, "html.parser").find_all("loc"):
                u = loc.get_text(strip=True)
                if is_post_url(u):
                    found.add(u)
            time.sleep(0.3)
    else:
        for loc in soup.find_all("loc"):
            u = loc.get_text(strip=True)
            if is_post_url(u):
                found.add(u)

    return found


def urls_from_archives():
    """Walk every month page. No early break - the whole range is cheap."""
    found = set()
    hits = 0
    misses = 0

    for year in range(2016, 2027):
        for month in range(1, 13):
            tag = "%02d-%04d" % (month, year)
            status, page = fetch(BASE + "/blog/archives/" + tag, tries=1, quiet=True)

            if not page:
                misses += 1
                continue

            hits += 1
            before = len(found)
            for a in BeautifulSoup(page, "html.parser").find_all("a", href=True):
                u = urljoin(BASE, a["href"])
                if u.startswith(BASE) and is_post_url(u):
                    found.add(u)

            gained = len(found) - before
            if gained:
                print("    %s -> +%d" % (tag, gained))

            time.sleep(0.3)

    print("  archive pages: %d responded, %d did not" % (hits, misses))
    return found


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


def find_date(soup, raw):
    for tag in ["div", "span", "p"]:
        for node in soup.find_all(
            tag, attrs={"class": re.compile(r"date", re.I)}
        ):
            m = DATE_RE.search(node.get_text(" ", strip=True))
            if m:
                return "%04d-%02d-%02d" % (
                    int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))

    t = soup.find("time")
    if t and t.get("datetime"):
        return t["datetime"][:10]

    m = DATE_RE.search(raw)
    if m:
        return "%04d-%02d-%02d" % (
            int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
    return None


def find_title(soup, url):
    for sel in ["h2.blog-title", ".blog-title", "h1", "h2"]:
        node = soup.select_one(sel)
        if node:
            txt = clean_text(node.get_text(" ", strip=True))
            if txt and len(txt) > 3:
                return txt

    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        return clean_text(og["content"])

    if soup.title:
        t = clean_text(soup.title.get_text())
        return re.sub(r"\s*[-|]\s*Misfit Entrepreneur.*$", "", t).strip()

    return url.rstrip("/").split("/")[-1].replace("-", " ").title()


JUNK = re.compile(
    r"blog-sidebar|blog-header|blog-date|blog-title|social|share|comment|"
    r"wsite-com|banner|nav|footer|header|archives|categories|rss",
    re.I,
)


def find_body(soup):
    container = None
    for sel in [
        "div.blog-content",
        "div.blog-post-content",
        "div.post-content",
        "div.entry-content",
        "div.wsite-multicol",
        "div#wsite-content",
    ]:
        node = soup.select_one(sel)
        if node:
            container = node
            break

    if container is None:
        parts = []
        for p in soup.find_all("div", class_=re.compile(r"paragraph", re.I)):
            if len(p.get_text(" ", strip=True)) > 40:
                parts.append(str(p))
        return "\n".join(parts)

    for bad in container.find_all(
        ["script", "style", "form", "iframe", "nav", "footer"]
    ):
        bad.decompose()
    for bad in container.find_all(attrs={"class": JUNK}):
        bad.decompose()

    return str(container)


def main():
    if not probe():
        sys.exit(1)

    print("Enumerating post URLs")
    urls = urls_from_sitemap()
    print("  from sitemap: %d" % len(urls))

    if len(urls) < 30:
        print("  crawling archive pages instead")
        urls |= urls_from_archives()

    urls = sorted(urls)
    print("\nTotal unique post URLs: %d\n" % len(urls))

    if not urls:
        print("No post URLs found. Aborting without writing.")
        sys.exit(1)

    posts = []
    failures = []

    for i, url in enumerate(urls, 1):
        slug = url.rstrip("/").split("/")[-1]
        print("[%d/%d] %s" % (i, len(urls), slug))

        status, raw = fetch(url)
        if not raw:
            print("    status %s" % status)
            failures.append(slug)
            continue

        soup = BeautifulSoup(raw, "html.parser")
        title = find_title(soup, url)
        date = find_date(soup, raw)
        body_html = find_body(soup)

        plain = clean_text(BeautifulSoup(body_html, "html.parser").get_text(" "))
        words = len(plain.split()) if plain else 0

        if words < 40:
            print("    thin (%d words), skipped" % words)
            failures.append(slug)
            continue

        posts.append({
            "slug": slug,
            "url": url,
            "title": title,
            "date": date,
            "body_html": body_html,
            "plain": plain,
            "word_count": words,
        })

        time.sleep(0.4)

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
        print("  " + ", ".join(failures[:25]))
    print("Written to       : %s" % OUT)


if __name__ == "__main__":
    main()
