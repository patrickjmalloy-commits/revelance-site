#!/usr/bin/env python3
"""Monthly site health check for revelanceoh.com.

Reads the live sitemap, then for every page checks: it loads, links and
images on it resolve, structured data parses, FAQ data matches the visible
FAQ, no past events are listed, no known-outdated facts reappear, and forms
keep their spam protection. Writes a Markdown report and exits 0 either way
(the report itself says whether anything needs attention).

Usage: site_health.py [BASE_URL] [REPORT_PATH]
Standard library only, so it runs on a stock GitHub runner.
"""
import concurrent.futures as cf
import datetime as dt
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://revelanceoh.com').rstrip('/')
REPORT = sys.argv[2] if len(sys.argv) > 2 else 'report.md'
HOST = urllib.parse.urlparse(BASE).netloc
UA = {'User-Agent': 'RevelanceSiteHealth/1.0 (+monthly check)'}

# Values corrected in October 2026; if any come back, a page was overwritten.
OUTDATED = {
    '8am opening time': r'\b8\s*(?:am|a\.m\.)\s*(?:–|-|—|to)\s*6\s*(?:pm|p\.m\.)',
    '"November 7" opening': r'November 7\b',
    '"20 minutes" from Cincinnati': r'\b20 minutes (?:north|from)',
    'Taproom "up to 50"': r'up to 50\b',
    '"MA Design" architect': r'\bMA Design\b',
    '"three boardrooms"': r'\bthree boardrooms\b',
    'Taproom 50 seated': r'Taproom[^.]{0,60}\b50 seated',
}


def fetch(url, method='GET'):
    req = urllib.request.Request(url, headers=UA, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read() if method == 'GET' else b''
            return r.status, body.decode('utf-8', 'replace'), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, '', url
    except Exception as e:  # DNS, timeout, TLS
        return 0, str(e), url


def visible_text(page):
    page = re.sub(r'(?is)<(script|style|noscript)\b.*?</\1>', ' ', page)
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'(?s)<[^>]+>', ' ', page)))


def main():
    issues, notes = [], []
    status, sm, _ = fetch(BASE + '/sitemap.xml')
    if status != 200:
        issues.append(f'sitemap.xml returned {status}')
        sm = ''
    pages = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', sm)
    for path in ('/robots.txt', '/llms.txt'):
        s, _, _ = fetch(BASE + path)
        if s != 200:
            issues.append(f'`{path}` returned {s}')

    # Page-level checks
    bodies = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for url, (s, body, final) in zip(pages, ex.map(fetch, [p.replace('https://revelanceoh.com', BASE) for p in pages])):
            path = urllib.parse.urlparse(url).path
            if s != 200 or '</html>' not in body:
                issues.append(f'`{path}` did not load (HTTP {s})')
                continue
            bodies[url] = body

    now = dt.datetime.now(dt.timezone.utc)
    upcoming = 0
    links = {}
    for url, body in bodies.items():
        path = urllib.parse.urlparse(url).path
        # structured data
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', body, re.S)
        faq_schema = None
        for b in blocks:
            try:
                d = json.loads(b)
            except ValueError:
                issues.append(f'`{path}`: structured data block does not parse')
                continue
            if isinstance(d, dict) and d.get('@type') == 'FAQPage':
                faq_schema = [q.get('name', '').strip() for q in d.get('mainEntity', [])]
            if isinstance(d, dict) and d.get('@type') == 'ItemList':
                for li in d.get('itemListElement', []):
                    ev = li.get('item', li) if isinstance(li, dict) else {}
                    if ev.get('@type') != 'Event':
                        continue
                    when = ev.get('endDate') or ev.get('startDate') or ''
                    try:
                        t = dt.datetime.fromisoformat(when.replace('Z', '+00:00'))
                        if t.tzinfo is None:
                            t = t.replace(tzinfo=dt.timezone.utc)
                    except ValueError:
                        continue
                    if t < now:
                        issues.append(f'`{path}`: past event still listed in search data ({ev.get("name", "?")}, {when[:10]})')
                    elif path == '/events/':
                        upcoming += 1
        visible_faq = [html.unescape(re.sub(r'<[^>]+>', '', q)).strip()
                       for q in re.findall(r'<button class="faq-q"[^>]*>(.*?)</button>',
                                          re.sub(r'<span class="ic">.*?</span>', '', body), re.S)]
        if faq_schema is not None and visible_faq and faq_schema != visible_faq:
            issues.append(f'`{path}`: FAQ search data no longer matches the visible FAQ')
        if faq_schema is not None and not visible_faq:
            issues.append(f'`{path}`: FAQ search data but no visible FAQ')
        # outdated facts
        text = visible_text(body)
        for label, pat in OUTDATED.items():
            if re.search(pat, text, re.I):
                issues.append(f'`{path}`: outdated fact reappeared — {label}')
        # forms keep spam protection
        for form in re.findall(r'<form\b[^>]*>', body):
            if 'data-netlify' in form or 'netlify' in form:
                if 'netlify-honeypot' not in form:
                    issues.append(f'`{path}`: a form is missing its spam honeypot')
        # collect links and images on our own host
        markup = re.sub(r'(?is)<script\b.*?</script>', ' ', body)  # links built in scripts aren't real URLs
        for ref in re.findall(r'(?:href|src)="([^"#]+)"', markup):
            if ref.startswith(('mailto:', 'tel:', 'javascript:', 'data:', 'sms:')) or any(c in ref for c in "'{}+$"):
                continue
            full = urllib.parse.urljoin(url, html.unescape(ref))
            if urllib.parse.urlparse(full).netloc in ('revelanceoh.com', 'www.revelanceoh.com', HOST):
                full = urllib.parse.urlunparse(urllib.parse.urlparse(full)._replace(netloc=HOST, scheme=urllib.parse.urlparse(BASE).scheme, query='', fragment=''))
                links.setdefault(full, set()).add(path)

    if '/events/' in [urllib.parse.urlparse(u).path for u in bodies] and upcoming == 0:
        issues.append('No upcoming events are listed on /events/ — add new events or the page looks stale')
    else:
        notes.append(f'{upcoming} upcoming events listed on /events/')

    # Link and image check (HEAD, fall back to GET)
    def check(u):
        s, _, _ = fetch(u, 'HEAD')
        if s in (0, 405, 501):
            s, _, _ = fetch(u)
        return u, s
    with cf.ThreadPoolExecutor(8) as ex:
        for u, s in ex.map(check, sorted(links)):
            if s >= 400 or s == 0:
                where = ', '.join(sorted(links[u])[:3])
                issues.append(f'Broken link or image `{urllib.parse.urlparse(u).path}` (HTTP {s}) on {where}')

    notes.append(f'{len(bodies)} of {len(pages)} sitemap pages loaded; {len(links)} internal links and images checked')
    month = now.strftime('%B %Y')
    lines = [f'## Site health report — {month}', '']
    if issues:
        lines += [f'**{len(issues)} item(s) need attention:**', ''] + [f'- [ ] {i}' for i in issues]
    else:
        lines += ['**All checks passed.** Nothing needs attention this month.']
    lines += ['', '<details><summary>What was checked</summary>', '',
              '- Every page in the sitemap loads', '- Internal links and images resolve',
              '- Structured data parses; FAQ data matches the visible FAQ; no past events listed',
              '- Corrected facts have not reverted (hours, opening date, drive time, capacities, architect, boardrooms)',
              '- Forms keep their spam honeypot', ''] + [f'- {n}' for n in notes] + ['', '</details>']
    open(REPORT, 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
