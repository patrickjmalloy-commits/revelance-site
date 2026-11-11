#!/usr/bin/env python3
"""Sync the homepage "Upcoming events" grid from the Events page.

Run from the repo root after editing events/index.html:

    python3 .github/scripts/sync_home_events.py

The Events page (events/index.html) is the source of truth. This copies the
next few upcoming cards into the homepage grid (#home-ev-grid) and rebuilds the
homepage ItemList structured data to match, so the two never drift apart.
site_rules.py fails the release when the homepage is missing a card this
script would pick, so run it before pushing.

Which cards go home (HOME_SLOTS of them):
  1. single-day events that have not ended yet, soonest first;
  2. then running multi-day drives (cards with data-event-end-date), the one
     that runs longest first.
So when there are more events than slots, a drive that ends soon drops off the
homepage first; it stays on the Events page.
"""
import datetime
import json
import os
import re
import sys

HOME_SLOTS = 5
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
EVENTS = os.path.join(ROOT, 'events', 'index.html')
HOME = os.path.join(ROOT, 'index.html')

# A card closes with four </div> lines: actions, detail, info, card.
CARD_RE = re.compile(r'<div id="(ev-[a-z0-9-]+)" class="ev-card[^"]*"[^>]*>.*?\n</div>\n</div>\n</div>\n</div>\n', re.S)
ATTR_RE = re.compile(r'(data-event-date|data-event-end-date|data-event-end)="([^"]*)"')
LD_RE = re.compile(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', re.S)


def itemlist(html):
    """The match for the page's ItemList JSON-LD block (group 1 is the JSON)."""
    for m in LD_RE.finditer(html):
        if '"@type": "ItemList"' in m.group(1):
            return m
    sys.exit('no ItemList JSON-LD found')


def today():
    # Site time is Eastern; the date only matters to the day.
    return datetime.date.fromisoformat(os.environ.get('SYNC_TODAY') or
                                       datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5))).date().isoformat())


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def upcoming_cards(events_html):
    """Cards in the Events page's upcoming grid, in page order."""
    start = events_html.index('id="upcoming"')
    end = events_html.index('<!-- AUTO-HIDE PAST EVENTS', start)
    return CARD_RE.findall(events_html[start:end]), [m.group(0) for m in CARD_RE.finditer(events_html[start:end])]


def select(events_html, day=None):
    """Card ids the homepage should show, in order."""
    day = day or today()
    ids, blocks = upcoming_cards(events_html)
    singles, drives = [], []
    for cid, block in zip(ids, blocks):
        attrs = dict(ATTR_RE.findall(block.split('>', 1)[0]))
        start = datetime.date.fromisoformat(attrs['data-event-date'])
        end_date = attrs.get('data-event-end-date')
        if end_date:
            end = datetime.date.fromisoformat(end_date)
            if end >= day:
                drives.append((end, cid))
        elif start >= day:
            singles.append((start, cid))
    singles.sort()
    drives.sort(reverse=True)
    return [c for _, c in singles + drives][:HOME_SLOTS]


def home_ids(home_html):
    start = home_html.index('id="home-ev-grid"')
    end = home_html.index('<!-- /home-ev-grid -->', start)
    return CARD_RE.findall(home_html[start:end])


def build_grid(events_html, chosen):
    ids, blocks = upcoming_cards(events_html)
    by_id = dict(zip(ids, blocks))
    out = []
    for cid in chosen:
        out.append(by_id[cid].replace('href="../', 'href="'))
    return ''.join(out)


def build_itemlist(events_html, home_html, chosen):
    src = json.loads(itemlist(events_html).group(1))
    dst = json.loads(itemlist(home_html).group(1))
    items = {it['item']['url'].rsplit('#', 1)[-1]: it['item'] for it in src['itemListElement']}
    missing = [c for c in chosen if c not in items]
    if missing:
        sys.exit('events/index.html ItemList has no entry for: ' + ', '.join(missing))
    for cid in chosen:
        if 'organizer' not in items[cid]:
            sys.exit('events/index.html ItemList entry for ' + cid + ' has no organizer')
    dst['itemListElement'] = [{'@type': 'ListItem', 'position': i + 1, 'item': items[c]} for i, c in enumerate(chosen)]
    return json.dumps(dst, indent=2, ensure_ascii=False)


def main():
    events_html, home_html = read(EVENTS), read(HOME)
    chosen = select(events_html)
    grid = build_grid(events_html, chosen)
    start = home_html.index('id="home-ev-grid"')
    start = home_html.index('>', start) + 2  # after the opening tag and its newline
    comment = home_html.index('<!-- /home-ev-grid -->', start)
    end = home_html.rindex('</div>\n', start, comment)  # keep the grid's own closing tag
    new = home_html[:start] + grid + home_html[end:]
    m = itemlist(new)
    new = new[:m.start(1)] + build_itemlist(events_html, home_html, chosen) + new[m.end(1):]
    if new == home_html:
        print('homepage events already in sync:', ', '.join(chosen))
        return
    with open(HOME, 'w', encoding='utf-8') as fh:
        fh.write(new)
    print('homepage events updated:', ', '.join(chosen))


if __name__ == '__main__':
    main()
