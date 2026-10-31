#!/usr/bin/env python3
"""Site rules: static checks every page must pass before it can go live.

Run from the repo root:  python3 .github/scripts/site_rules.py
Exits 1 and lists every violation if any rule fails. The promote-production
workflow runs this on each staging push, so a failing page blocks the
approval request.

Each rule exists because the problem reached staging at least once.
"""
import json
import re
from html.parser import HTMLParser
import subprocess
import sys

# Pages that are deliberately minimal (no site nav, footer or analytics).
APP_PAGES = {'404.html'}
# Retired page kept only as a redirect target in netlify.toml.
RETIRED = {'blog/food-truck-commissary-kitchen-cincinnati.html'}

GOLD = {'--gold-light': '#D4BA85', '--gold-dark': '#B08C4A', '--gold': '#C9A96E'}


class _Structure(HTMLParser):
    TAGS = ('span', 'a', 'div', 'section', 'article', 'main', 'ul', 'ol', 'button',
            'h1', 'h2', 'h3', 'h4', 'footer', 'nav', 'form', 'label', 'table')

    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag in self.TAGS:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag not in self.TAGS:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            return
        self.errors.append((tag, self.getpos()[0]))
        for k in range(len(self.stack) - 1, -1, -1):
            if self.stack[k][0] == tag:
                del self.stack[k:]
                break


def pages():
    out = subprocess.check_output(
        ['git', 'ls-files', '-co', '--exclude-standard', '*.html']).decode().split()
    return [p for p in out if not p.startswith(('node_modules/', '.github/'))]


def strip_scripts_styles(s):
    return re.sub(r'(?is)<(script|style)\b.*?</\1>', '', s)


def check(path, s, errors):
    def err(msg):
        errors.append(f'{path}: {msg}')

    body = strip_scripts_styles(s)

    # 1. No breadcrumbs. The site never shows a "Home > Section > Page" trail,
    #    visible or in structured data.
    if re.search(r'(?i)<[a-z][^>]*\b(class|id)="[^"]*breadcrumb', body):
        err('breadcrumb element found (the site does not use breadcrumbs)')
    if re.search(r'(?i)aria-label="breadcrumbs?"', body):
        err('breadcrumb navigation found (aria-label="breadcrumb")')
    if '"BreadcrumbList"' in s:
        err('BreadcrumbList structured data found (the site does not use breadcrumbs)')

    # 2. No code printed as page text: JavaScript right after a </script>
    #    means an opening <script> tag is missing.
    m = re.search(r'</script>\s*(/\*|//|\(function|var |let |const |document\.|window\.)', s)
    if m:
        line = s.count('\n', 0, m.start()) + 1
        err(f'line {line}: JavaScript outside a <script> tag (missing opening <script>?)')

    # 3. Gold colours come from one palette.
    for var, want in GOLD.items():
        for v in re.findall(re.escape(var) + r':\s*(#[0-9A-Fa-f]{6})', s):
            if v.upper() != want:
                err(f'{var} is {v}; site standard is {want}')

    # 3b. Page structure: every opened container closes in order. A dropped
    #     opening tag (e.g. a lost <span>) shows as broken text, not an error.
    p = _Structure()
    p.feed(re.sub(r'(?s)<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'),
                  re.sub(r'(?is)<(script|style)\b.*?</\1>', lambda m: '\n' * m.group(0).count('\n'), s)))
    p.close()
    for tag, line in p.errors[:3]:
        err(f'line {line}: </{tag}> does not match an open <{tag}> (missing or extra tag)')
    if p.stack and not p.errors:
        tag, line = p.stack[-1]
        err(f'line {line}: <{tag}> is never closed')

    # 3c. Structured data parses, and every Event has the fields Google's
    #     event report asks for (a missing "offers" was flagged in Search Console).
    def events(o):
        if isinstance(o, dict):
            if o.get('@type') == 'Event':
                yield o
            for v in o.values():
                yield from events(v)
        elif isinstance(o, list):
            for v in o:
                yield from events(v)
    for m in re.finditer(r'(?s)<script type="application/ld\+json">(.*?)</script>', s):
        line = s.count('\n', 0, m.start()) + 1
        try:
            data = json.loads(m.group(1))
        except ValueError:
            err(f'line {line}: structured data (JSON-LD) is not valid JSON')
            continue
        for ev in events(data):
            missing = [k for k in ('name', 'startDate', 'endDate', 'location', 'offers') if k not in ev]
            if missing:
                err(f'line {line}: Event "{ev.get("name", "?")}" is missing {", ".join(missing)}')

    if path in APP_PAGES or path in RETIRED:
        return

    # 4. Google Analytics is configured, not just loaded.
    if 'googletagmanager.com/gtag/js' in s and "gtag('config'" not in s:
        err("GA4 script loads but gtag('config', ...) is missing; no visits are recorded")

    # 5. Phone/email tap tracking on every page with a phone or email link.
    if re.search(r'href="(tel:|mailto:)', s) and 'id="rv-contact-clicks"' not in s:
        err('phone/email links without the rv-contact-clicks tracker')

    # 6. Standard navigation links (catches stale copies of old pages).
    if 'class="nav-dropdown' in s:
        for href, label in (('explore/', 'Explore the Building'), ('virtual-office/', 'Virtual Address')):
            if not re.search(r'href="[./]*' + re.escape(href) + r'">' + re.escape(label) + '</a>', s):
                err(f'menu is missing the "{label}" link')


def main():
    errors = []
    files = pages()
    for p in files:
        with open(p, encoding='utf-8') as fh:
            check(p, fh.read(), errors)
    if errors:
        print(f'Site rules: {len(errors)} problem(s) in {len({e.split(":")[0] for e in errors})} page(s)')
        for e in errors:
            print('  ' + e)
        sys.exit(1)
    print(f'Site rules: all {len(files)} pages pass')


if __name__ == '__main__':
    main()
