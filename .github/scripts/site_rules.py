#!/usr/bin/env python3
"""Site rules: static checks every page must pass before it can go live.

Run from the repo root:  python3 .github/scripts/site_rules.py
Exits 1 and lists every violation if any rule fails. The promote-production
workflow runs this on each staging push, so a failing page blocks the
approval request.

Each rule exists because the problem reached staging at least once.
"""
import re
import subprocess
import sys

# Pages that are deliberately minimal (no site nav, footer or analytics).
APP_PAGES = {'404.html'}
# Retired page kept only as a redirect target in netlify.toml.
RETIRED = {'blog/food-truck-commissary-kitchen-cincinnati.html'}

GOLD = {'--gold-light': '#D4BA85', '--gold-dark': '#B08C4A', '--gold': '#C9A96E'}


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
