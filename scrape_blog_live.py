#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR - Live Blog Archive Scraper
================================================
The original blog is still live on Weebly at www.misfitentrepreneur.com/blog/.
The earlier scraper pulled from the Wayback Machine and its selectors did not
match Weebly's markup, which is why the imported posts came out truncated.

This version scrapes the live site instead.

  1. Read sitemap.xml to enumerate every blog post URL
  2. Fall back to crawling /blog/archives/MM-YYYY pages if the sitemap is thin
  3. Fetch each post and extract title, date, and full body
  4. Write blog_archive.json

Writes data only. Does not touch the existing /blog/*.html pages.

Run via the "Scrape Live Blog Archive" workflow in the Actions tab.
"""

import json
import re
import sys
import time
import html as htmllib
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://www.misfitentrepreneur.com"
SITEMAP = BASE + "/sitemap.xml"
OUT = "blog_archive.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MisfitArchiveBot/1.0)",
    "Accept": "text/html,application/xhtml+xml,application/xml",
}

# Paths under /blog/ that are listings, not posts
NON_POST = ("archives", "category", "tag", "page", "author", "feed", "rss")


def get(url, tries=3):
    for i in range(tries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.text
            if r.status_code == 404:
                return None
        except Exception as e:
            print("    retry %d: %s" % (i + 1, e))
        time.sleep(2)
    return None


def is_post_url(u):
    if "/blog/" not in u:
        return False
    tail = u.split("/blog/", 1)[1].strip("/")
    if not tail or "?" in tail or "#" in tail:
        return False
    first = tail.split("/")[0].lower()
    if first in NON_POST:
        return False
    return True


def urls_from_sitemap():
    """Weebly publishes a sitemap. Follow index sitemaps one level."""
    found = set()
    xml = get(SITEMAP)
    if not xml:
        print("  sitemap.xml not reachable")
        return found

    soup = BeautifulSoup(xml, "html.parser")

    child_maps = [
        loc.get_text(strip=True)
        for sm in soup.find_all("sitemap")
        for loc in sm.find_all("loc")
    ]

    if child_maps:
        print("  sitemap index with %d child maps" % len(child_maps))
        for cm in child_maps:
            sub = get(cm)
            if not sub:
                continue
            ssoup = BeautifulSoup(sub, "html.parser")
            for loc in ssoup.find_all("loc"):
                u = loc.get_text(strip=True)
                if is_post_url(u):
                    found.add(u)
            time.sleep(0.4)
    else:
        for loc in soup.find_all("loc"):
            u = loc.get_text(strip=True)
            if is_post_url(u):
                found.add(u)

    return found


def urls_from_archives():
    """Fallback: walk every month page and collect post links."""
    found = set()
    months = []
    for year in range(2016, 2027):
        for month in range(1, 13):
            months.append("%02d-%04d" % (month, year))

    empty_streak = 0
    for m in months:
        page = get(BASE + "/blog/archives/" + m, tries=1)
        if not page:
            empty_streak += 1
            if empty_streak > 30:
                break
            continue
        empty_streak = 0
        soup = BeautifulSoup(page, "html.parser")
        before = len(found)
        for a in soup.find_all("a", href=True):
            u = urljoin(BASE, a["href"])
            if u.startswith(BASE) and is_post_url(u):
                found.add(u)
        if len(found) > before:
            print("    %s -> +%d" % (m, len(found) - before))
        time.sleep(0.4)

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
    for sel in [
        {"class": re.compile(r"blog-date|post-date|date-text", re.I)},
        {"class": re.compile(r"\bdate\b", re.I)},
    ]:
        for node in soup.find_all("div", attrs=sel) + soup.find_all("span", attrs=sel):
            m = DATE_RE.search(node.get_text(" ", strip=True))
            if m:
                return "%04d-%02d-%02d" % (
                    int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))
                )

    t = soup.find("time")
    if t and t.get("datetime"):
        return t["datetime"][:10]

    m = DATE_RE.search(raw)
    if m:
        return "%04d-%02d-%02d" % (
            int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))
        )
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


JUNK_PAT = re.compile(
    r"blog-sidebar|blog-header|blog-date|blog-title|social|share|comment|"
    r"wsite-com|banner|nav|footer|header|archives|categories|rss",
    re.I,
)


def find_body(soup):
    """Weebly wraps post text in .blog-content, with paragraphs inside."""
    container = None
    for sel in [
        "div.blog-content",
        "div.blog-post-content",
        "div.post-content",
        "div.entry-content",
        "div.wsite-multicol",
    ]:
        node = soup.select_one(sel)
        if node:
            container = node
            break

    if container is None:
        paras = soup.find_all("div", class_=re.compile(r"paragraph", re.I))
        if paras:
            html_parts = []
            for p in paras:
                txt = p.get_text(" ", strip=True)
                if len(txt) > 40:
                    html_parts.append(str(p))
            return "\n".join(html_parts)
        return ""

    for bad in container.find_all(
        ["script", "style", "form", "iframe", "nav", "footer"]
    ):
        bad.decompose()

    for bad in container.find_all(attrs={"class": JUNK_PAT}):
        bad.decompose()

    return str(container)


def main():
    print("Enumerating blog post URLs")
    urls = urls_from_sitemap()
    print("  sitemap found %d post URLs" % len(urls))

    if len(urls) < 30:
        print("  sitemap thin, crawling archive pages")
        urls |= urls_from_archives()

    urls = sorted(urls)
    print("Total unique post URLs: %d\n" % len(urls))

    if not urls:
        print("No post URLs found. Aborting without writing.")
        sys.exit(1)

    posts = []
    failures = []

    for i, url in enumerate(urls, 1):
        slug = url.rstrip("/").split("/")[-1]
        print("[%d/%d] %s" % (i, len(urls), slug))

        raw = get(url)
        if not raw:
            failures.append(slug)
            continue

        soup = BeautifulSoup(raw, "html.parser")

        title = find_title(soup, url)
        date = find_date(soup, raw)
        body_html = find_body(soup)

        plain = clean_text(BeautifulSoup(body_html, "html.parser").get_text(" "))
        words = len(plain.split()) if plain else 0

        if words < 40:
            print("    thin (%d words), skipping" % words)
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

        time.sleep(0.5)

    posts.sort(key=lambda p: p["date"] or "0000-00-00")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=1, ensure_ascii=False)

    wc = [p["word_count"] for p in posts] or [0]
    dated = sum(1 for p in posts if p["date"])

    print("\n" + "=" * 50)
    print("Posts captured : %d" % len(posts))
    print("With a date    : %d" % dated)
    print("Words min/avg/max: %d / %d / %d" % (
        min(wc), sum(wc) // len(wc), max(wc)))
    print("Skipped/failed : %d" % len(failures))
    if failures:
        print("  " + ", ".join(failures[:25]))
    print("Written to     : %s" % OUT)


if __name__ == "__main__":
    main()
