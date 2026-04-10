#!/usr/bin/env python3
"""
MISFIT ENTREPRENEUR — Episode Show Notes Generator
====================================================
Fetches all episode show notes from the current Weebly site
and generates matching HTML files for the new Netlify site.

REQUIREMENTS:
  pip install requests beautifulsoup4 lxml

HOW TO RUN:
  python3 generate_episodes.py

OUTPUT:
  Creates /episodes/ folder with one .html file per episode
  Upload the entire /episodes/ folder to your GitHub repo

ESTIMATED TIME: ~30-60 minutes for 460+ episodes (rate-limited to be polite)
"""

import os
import re
import time
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote
import html as html_module

# ── CONFIG ───────────────────────────────────────────────────
BASE_URL     = "https://www.misfitentrepreneur.com"
ARCHIVE_URL  = f"{BASE_URL}/archives.html"
OUTPUT_DIR   = "episodes"
DELAY        = 1.5  # seconds between requests — be polite
LOG_FILE     = "episode_generator.log"

# ── TEMPLATE ASSETS (base64 strings) ─────────────────────────
# These will be read from the files you already have
# Place logo.b64, ebook.b64, pb.b64 in the same folder as this script
# OR replace with the actual base64 strings from your existing HTML files

def read_asset(filename):
    """Read a base64 asset file, or return empty string if not found."""
    try:
        with open(filename, 'r') as f:
            return f.read().strip()
    except:
        print(f"  ⚠ Asset not found: {filename} — using placeholder")
        return ""

# ── STEP 1: GET ALL ARCHIVE URLs ────────────────────────────
def get_archive_urls():
    """Fetch the archives page and extract all episode show notes URLs."""
    print("\n📋 Fetching archive page...")
    
    try:
        resp = requests.get(ARCHIVE_URL, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; MisfitEpisodeBuilder/1.0)'
        })
        soup = BeautifulSoup(resp.text, 'lxml')
    except Exception as e:
        print(f"  ❌ Failed to fetch archive: {e}")
        return []
    
    urls = []
    seen = set()
    
    # Find all links that point to episode show notes pages
    for a in soup.find_all('a', href=True):
        href = a['href']
        full_url = urljoin(BASE_URL, href)
        
        # Episode show notes URLs contain episode keywords and end in .html
        if (full_url.startswith(BASE_URL) and 
            full_url.endswith('.html') and
            full_url not in [BASE_URL + x for x in ['/archives.html', '/about.html', 
                '/podcast.html', '/contact.html', '/blog.html', '/speaking.html',
                '/start-here.html', '/media.html', '/truths.html']] and
            'misfit-entrepreneur' in full_url and
            full_url not in seen):
            
            # Skip if it's a libsyn audio URL
            if 'libsyn.com' in full_url or 'traffic.libsyn' in full_url:
                continue
                
            urls.append(full_url)
            seen.add(full_url)
            ep_title = a.get_text(strip=True)[:80]
            print(f"  ✓ Found: {ep_title}")
    
    print(f"\n  Total episode pages found: {len(urls)}")
    return urls


# ── STEP 2: PARSE AN EPISODE PAGE ───────────────────────────
def parse_episode_page(url):
    """
    Fetch and parse a single episode show notes page.
    Returns a dict with all the template variables.
    """
    try:
        resp = requests.get(url, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; MisfitEpisodeBuilder/1.0)'
        })
        soup = BeautifulSoup(resp.text, 'lxml')
    except Exception as e:
        print(f"    ❌ Fetch failed: {e}")
        return None
    
    # Get page title for episode title + number extraction
    page_title = soup.find('title')
    page_title_text = page_title.get_text(strip=True) if page_title else ""
    
    # Extract episode number from title
    ep_num_match = re.search(r'[\-\s](\d{1,3})[\:\s]', page_title_text)
    episode_number = ep_num_match.group(1) if ep_num_match else "?"
    
    # Get all text content from the main table cells (Weebly uses tables)
    # The show notes content is usually in the largest table cell
    all_text = ""
    main_content = ""
    intro = ""
    show_notes_raw = ""
    best_quote = ""
    misfit1 = misfit2 = misfit3 = ""
    guest_name = ""
    guest_links_html = ""
    episode_title = ""
    publish_date = ""
    
    # Find main content area — Weebly puts content in td elements
    tds = soup.find_all('td')
    content_td = None
    max_len = 0
    
    for td in tds:
        text = td.get_text(strip=True)
        if len(text) > max_len:
            max_len = len(text)
            content_td = td
    
    if not content_td:
        return None
    
    full_text = content_td.get_text('\n', strip=True)
    
    # Extract episode title (usually starts with episode number + colon)
    title_match = re.search(r'(\d{1,3}):?\s{1,3}(.+?)(?:\n|This week)', full_text, re.DOTALL)
    if title_match:
        ep_num = title_match.group(1).strip()
        ep_title_part = title_match.group(2).strip()[:120]
        episode_number = ep_num
        episode_title = f"{ep_num}: {ep_title_part}"
    else:
        episode_title = page_title_text.split(' - Misfit')[0].strip()
    
    # Extract guest name from "This week's Misfit Entrepreneur is [NAME]"
    guest_match = re.search(r"This week'?s Misfit Entrepreneur is ([^\.]+)\.", full_text)
    if guest_match:
        guest_name = guest_match.group(1).strip()
        # Clean up common trailing words
        guest_name = re.sub(r'\s+(Let|I |In |As |Join|Today|We|You|At |The ).*', '', guest_name).strip()
    
    # Extract intro (everything before "Show Notes")
    show_notes_idx = full_text.find('Show Notes')
    if show_notes_idx > 0:
        intro_raw = full_text[:show_notes_idx].strip()
        # Remove "Misfit Minute" line and subscribe text
        intro_raw = re.sub(r'Misfit Minute.*?Subscribe to the Misfit Minute!', '', intro_raw, flags=re.DOTALL)
        intro_raw = re.sub(r'Don\'t Miss.*?Misfit Minute!', '', intro_raw, flags=re.DOTALL)
        intro_lines = [l.strip() for l in intro_raw.split('\n') if l.strip() and len(l.strip()) > 20]
        # Take the substantive paragraphs (skip short lines like URLs)
        intro_paras = []
        for line in intro_lines:
            if not line.startswith('http') and not line.startswith('[') and len(line) > 40:
                intro_paras.append(f"<p>{html_module.escape(line)}</p>")
        intro = '\n'.join(intro_paras[:6])  # Max 6 paragraphs
    
    # Extract show notes section
    best_quote_idx = full_text.find('Best Quote')
    if show_notes_idx > 0 and best_quote_idx > show_notes_idx:
        show_notes_raw = full_text[show_notes_idx + len('Show Notes'):best_quote_idx].strip()
    elif show_notes_idx > 0:
        show_notes_raw = full_text[show_notes_idx + len('Show Notes'):].strip()
    
    # Convert show notes to HTML
    show_notes_html = convert_notes_to_html(show_notes_raw)
    
    # Extract best quote
    misfit3_idx = full_text.find('Misfit Three')
    if misfit3_idx < 0:
        misfit3_idx = full_text.find('Misfit 3')
    
    if best_quote_idx > 0:
        quote_end = misfit3_idx if misfit3_idx > best_quote_idx else len(full_text)
        quote_raw = full_text[best_quote_idx + len('Best Quote'):quote_end].strip()
        # Quote is usually in asterisks or after a bullet
        quote_match = re.search(r'\*(.+?)\*', quote_raw, re.DOTALL)
        if quote_match:
            best_quote = quote_match.group(1).strip()
        else:
            # Take first substantial sentence
            lines = [l.strip() for l in quote_raw.split('\n') if len(l.strip()) > 20]
            best_quote = lines[0] if lines else ""
        best_quote = html_module.escape(best_quote)
    
    # Extract Misfit 3
    if misfit3_idx > 0:
        m3_raw = full_text[misfit3_idx:]
        # Find the three items — they're usually on separate lines after the heading
        m3_lines = [l.strip() for l in m3_raw.split('\n') 
                   if l.strip() and len(l.strip()) > 10 
                   and l.strip() not in ['Misfit Three', 'Misfit 3', 'Show Sponsors']]
        m3_items = []
        for line in m3_lines[:9]:  # Look at first 9 lines for 3 items
            if 'sponsor' in line.lower() or 'misfit code' in line.lower():
                break
            if len(line) > 10:
                m3_items.append(line)
        
        if len(m3_items) >= 1:
            misfit1 = format_misfit_item(m3_items[0])
        if len(m3_items) >= 2:
            misfit2 = format_misfit_item(m3_items[1])
        if len(m3_items) >= 3:
            misfit3 = format_misfit_item(m3_items[2])
    
    # Extract guest links from the content
    for a in content_td.find_all('a', href=True):
        href = a['href']
        text = a.get_text(strip=True)
        # Skip internal links and platform links
        if (href.startswith('http') and 
            'misfitentrepreneur.com' not in href and
            'libsyn.com' not in href and
            'apple' not in href and
            'spotify' not in href and
            'youtube' not in href and
            'soundcloud' not in href and
            'stitcher' not in href and
            'google' not in href and
            text and len(text) > 3):
            display = text if len(text) < 60 else href
            guest_links_html += f'<a href="{html_module.escape(href)}" class="gc-link" target="_blank">{html_module.escape(display)}</a>\n'
    
    # Extract publish date from URL or page
    date_match = re.search(r'misfit-entrepreneur-(\w+)-(\d{4})', url)
    if date_match:
        month_name = date_match.group(1).capitalize()
        year = date_match.group(2)
        publish_date = f"{month_name} {year}"
    
    # Generate file slug from episode number and guest name
    guest_slug = re.sub(r'[^a-z0-9]+', '-', guest_name.lower()).strip('-') if guest_name else 'episode'
    file_slug = f"ep-{episode_number}-{guest_slug[:30]}"
    
    return {
        'episode_number': episode_number,
        'episode_title': episode_title,
        'guest_name': guest_name or "Dave Lukas",
        'guest_bio': "",  # Will be empty — Castmagic fills this going forward
        'guest_bio_short': episode_title[:150],
        'intro': intro,
        'show_notes_html': show_notes_html,
        'best_quote': best_quote,
        'misfit1': misfit1,
        'misfit2': misfit2,
        'misfit3': misfit3,
        'guest_links_html': guest_links_html,
        'publish_date': publish_date,
        'duration': "",  # From RSS
        'audio_url': "",  # From RSS — will be matched later
        'episode_image_url': "",
        'page_url': f"/episodes/{file_slug}/",
        'file_slug': file_slug,
        'source_url': url,
    }


def convert_notes_to_html(raw_text):
    """Convert plain text show notes to structured HTML."""
    if not raw_text:
        return ""
    
    lines = raw_text.split('\n')
    html_parts = []
    in_list = False
    in_sublist = False
    
    for line in lines:
        line = line.strip()
        if not line:
            if in_sublist:
                html_parts.append('</ul>')
                in_sublist = False
            if in_list:
                html_parts.append('</ul>')
                in_list = False
            continue
        
        # Detect bold section headers (lines with ** or all caps or ending in colon)
        is_header = (line.startswith('**') and line.endswith('**')) or \
                    (line.endswith(':') and len(line) < 80 and line == line.title()) or \
                    (re.match(r'^[A-Z][A-Za-z\s,&]+:$', line))
        
        # Detect bullet points
        is_bullet = line.startswith('*') or line.startswith('•') or \
                    line.startswith('+ ') or line.startswith('- ')
        
        # Detect sub-bullets (extra indent or + prefix)
        is_sub = line.startswith('  +') or line.startswith('  -') or \
                 line.startswith('\t+') or line.startswith('\t-')
        
        if is_header:
            if in_sublist: html_parts.append('</ul>'); in_sublist = False
            if in_list: html_parts.append('</ul>'); in_list = False
            clean = re.sub(r'\*+', '', line).rstrip(':').strip()
            html_parts.append(f'<h3>{html_module.escape(clean)}</h3>')
        
        elif is_sub:
            if not in_sublist:
                html_parts.append('<ul>')
                in_sublist = True
            clean = re.sub(r'^[\s\t\+\-\*]+', '', line).strip()
            html_parts.append(f'<li>{html_module.escape(clean)}</li>')
        
        elif is_bullet:
            if in_sublist: html_parts.append('</ul>'); in_sublist = False
            if not in_list:
                html_parts.append('<ul>')
                in_list = True
            clean = re.sub(r'^[\*\•\+\-]\s*', '', line).strip()
            html_parts.append(f'<li>{html_module.escape(clean)}</li>')
        
        else:
            if in_sublist: html_parts.append('</ul>'); in_sublist = False
            if in_list: html_parts.append('</ul>'); in_list = False
            if len(line) > 20:
                html_parts.append(f'<p>{html_module.escape(line)}</p>')
    
    if in_sublist: html_parts.append('</ul>')
    if in_list: html_parts.append('</ul>')
    
    return '\n'.join(html_parts)


def format_misfit_item(text):
    """Format a Misfit 3 item — extract bold headline if present."""
    text = re.sub(r'\*+', '', text).strip()
    # If it has a period, split into headline + detail
    if '. ' in text and len(text) > 30:
        parts = text.split('. ', 1)
        return f'<strong>{html_module.escape(parts[0])}.</strong> {html_module.escape(parts[1])}'
    return html_module.escape(text)


# ── STEP 3: GENERATE HTML FILE ───────────────────────────────
def generate_html(ep_data, template_html, logo_b64, ebook_b64, pb_b64):
    """Fill the episode template with parsed data."""
    
    page_url = ep_data['page_url']
    page_url_encoded = quote(f"https://misfitentrepreneur.com{page_url}", safe='')
    title_encoded = quote(ep_data['episode_title'], safe='')
    
    # Build episode image HTML
    img_html = ""
    if ep_data.get('episode_image_url'):
        img_html = f'<img src="{ep_data["episode_image_url"]}" alt="{html_module.escape(ep_data["episode_title"])}" class="ep-artwork">'
    else:
        img_html = f'<img src="data:image/jpeg;base64,{ebook_b64}" alt="Misfit Entrepreneur" class="ep-artwork">'
    
    # Build audio player
    audio_html = ""
    if ep_data.get('audio_url'):
        audio_html = f'<audio controls preload="metadata" src="{ep_data["audio_url"]}"></audio>'
    else:
        audio_html = '<!-- Audio URL not available — will be linked from Libsyn -->'
    
    # Replacements
    html = template_html
    html = html.replace('{{EPISODE_NUMBER}}', str(ep_data['episode_number']))
    html = html.replace('{{EPISODE_TITLE}}', ep_data['episode_title'])
    html = html.replace('{{GUEST_NAME}}', ep_data['guest_name'])
    html = html.replace('{{GUEST_BIO}}', ep_data.get('guest_bio', ''))
    html = html.replace('{{GUEST_BIO_SHORT}}', ep_data['guest_bio_short'])
    html = html.replace('{{INTRO_PARAGRAPH}}', ep_data['intro'] or f"<p>{ep_data['episode_title']}</p>")
    html = html.replace('{{SHOW_NOTES_HTML}}', ep_data['show_notes_html'] or '<p>Show notes coming soon.</p>')
    html = html.replace('{{BEST_QUOTE}}', ep_data['best_quote'] or "Tune in to hear the best quote from this episode.")
    html = html.replace('{{MISFIT_1}}', ep_data['misfit1'] or "Listen to the episode for the first Misfit 3 takeaway.")
    html = html.replace('{{MISFIT_2}}', ep_data['misfit2'] or "Listen to the episode for the second Misfit 3 takeaway.")
    html = html.replace('{{MISFIT_3}}', ep_data['misfit3'] or "Listen to the episode for the third Misfit 3 takeaway.")
    html = html.replace('{{GUEST_LINKS}}', ep_data['guest_links_html'] or '')
    html = html.replace('{{PUBLISH_DATE}}', ep_data['publish_date'])
    html = html.replace('{{DURATION}}', ep_data.get('duration', ''))
    html = html.replace('{{AUDIO_URL}}', ep_data.get('audio_url', ''))
    html = html.replace('{{PAGE_URL_ENCODED}}', page_url_encoded)
    html = html.replace('{{EPISODE_TITLE_ENCODED}}', title_encoded)
    html = html.replace('{{PREV_EP_URL}}', ep_data.get('prev_url', '/podcast/'))
    html = html.replace('{{PREV_EP_TITLE}}', ep_data.get('prev_title', 'Previous Episode'))
    html = html.replace('{{NEXT_EP_URL}}', ep_data.get('next_url', '/podcast/'))
    html = html.replace('{{NEXT_EP_TITLE}}', ep_data.get('next_title', 'Next Episode'))
    
    # Replace image placeholder in template
    html = html.replace('{{EPISODE_IMAGE_URL}}', img_html)
    
    # Replace audio element
    html = html.replace('<audio controls preload="metadata" src="{{AUDIO_URL}}"></audio>', audio_html)
    
    return html


# ── MAIN ─────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print(" MISFIT ENTREPRENEUR — Episode Page Generator")
    print("=" * 60)
    
    # Load assets
    print("\n📦 Loading assets...")
    logo_b64  = read_asset('logo_b64.txt')
    ebook_b64 = read_asset('ebook_b64.txt')
    pb_b64    = read_asset('pb_b64.txt')
    
    # Load template
    try:
        with open('episode-template.html', 'r') as f:
            template_html = f.read()
        print("  ✓ Template loaded")
    except:
        print("  ❌ episode-template.html not found in current directory")
        return
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Get all archive URLs
    urls = get_archive_urls()
    if not urls:
        print("❌ No episode URLs found. Check your internet connection.")
        return
    
    # Process each episode
    print(f"\n🎙️  Processing {len(urls)} episodes...\n")
    
    results = []
    failed = []
    
    for i, url in enumerate(urls):
        ep_short = url.split('/')[-1][:60]
        print(f"  [{i+1}/{len(urls)}] {ep_short}")
        
        ep_data = parse_episode_page(url)
        
        if not ep_data:
            print(f"    ⚠ Skipped (parse failed)")
            failed.append(url)
            time.sleep(DELAY)
            continue
        
        results.append(ep_data)
        print(f"    ✓ Ep {ep_data['episode_number']}: {ep_data['guest_name']} → {ep_data['file_slug']}.html")
        time.sleep(DELAY)
    
    # Add prev/next navigation
    for i, ep in enumerate(results):
        if i > 0:
            ep['next_url'] = f"/episodes/{results[i-1]['file_slug']}/"
            ep['next_title'] = results[i-1]['episode_title']
        if i < len(results) - 1:
            ep['prev_url'] = f"/episodes/{results[i+1]['file_slug']}/"
            ep['prev_title'] = results[i+1]['episode_title']
    
    # Generate HTML files
    print(f"\n📄 Generating HTML files...")
    generated = 0
    
    for ep_data in results:
        try:
            html = generate_html(ep_data, template_html, logo_b64, ebook_b64, pb_b64)
            filepath = os.path.join(OUTPUT_DIR, f"{ep_data['file_slug']}.html")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)
            generated += 1
        except Exception as e:
            print(f"  ❌ Failed to generate {ep_data['file_slug']}: {e}")
            failed.append(ep_data.get('source_url', ''))
    
    # Save episode index as JSON (useful for Make.com)
    index = [{'num': ep['episode_number'], 'title': ep['episode_title'], 
               'slug': ep['file_slug'], 'guest': ep['guest_name']} 
              for ep in results]
    with open('episode_index.json', 'w') as f:
        json.dump(index, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f" ✅ COMPLETE")
    print(f"   Generated: {generated} episode pages")
    print(f"   Failed:    {len(failed)}")
    print(f"   Output:    ./{OUTPUT_DIR}/ folder")
    print(f"   Index:     episode_index.json")
    print(f"\n NEXT STEPS:")
    print(f"   1. Upload the /episodes/ folder to your GitHub repo")
    print(f"   2. Netlify auto-deploys all pages")
    print(f"   3. Pages live at /episodes/ep-467-guest-name/")
    print(f"{'='*60}")
    
    if failed:
        print(f"\n⚠  Failed URLs saved to {LOG_FILE}")
        with open(LOG_FILE, 'w') as f:
            f.write('\n'.join(failed))


if __name__ == '__main__':
    main()
