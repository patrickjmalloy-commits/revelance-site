#!/usr/bin/env python3
"""Build the event pages from the Events page cards.

    python3 .github/scripts/event_pages.py          # create what is missing
    python3 .github/scripts/event_pages.py --check  # report only (site_rules uses this)
    python3 .github/scripts/event_pages.py --force ev-some-event   # rebuild one page

The card on events/index.html is the source of truth. For every upcoming card
(single-day events that have not happened, and drives whose end date has not
passed) this script makes sure there is:

  1. a page at /events/<slug>/ (slug = card id without "ev-"), built from the
     card: title, date and times, location, host, description paragraphs,
     RSVP link, badge, plus Add to Calendar, Share, directions, the other
     upcoming events, Event structured data and a "this event has passed"
     notice that shows itself the day after;
  2. a share image images/og-<slug>.jpg (1200x630, brand template; needs
     Playwright, which the cloud session has) unless the card already names
     one in the Events page ItemList;
  3. the card wired to the page: data-event-page, the title linked, an
     "Event Page" button first in the actions, and the ItemList entry's url
     pointing at the page;
  4. a sitemap entry.

Existing pages are left alone (edit them by hand, or --force to rebuild from
the card). Run sync_home_events.py afterwards; the release runs site_rules.py,
which fails when an upcoming card has no page.
"""
import datetime, html as H, json, os, re, subprocess, sys, tempfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
EVENTS = os.path.join(ROOT, 'events', 'index.html')
SHELL = os.path.join(ROOT, 'events', 'rsvp', 'index.html')
SITE = 'https://revelanceoh.com'
CARD_RE = re.compile(r'<div id="(ev-[a-z0-9-]+)" class="ev-card[^"]*"([^>]*?)>(.*?)\n</div>\n</div>\n</div>\n</div>\n', re.S)

# Hero photo by location keyword (first match wins); each has -480/-960/-1200 variants.
HEROES = [('culinary', 'culinary-lab-wide', 'The Culinary Lab at Revelance, a commercial test kitchen with a chef’s counter'),
          ('taproom', 'taphouse-bartender-pour', 'A bartender pouring a Sonder Brewing beer in the Taproom at Revelance'),
          ('c-suite', 'csuite-lifestyle-lounge', 'The C-Suite Lounge at Revelance'),
          ('revel room', 'revel-banquet-sunset', 'The Revel Room at Revelance set for a banquet'),
          ('market', 'revel-market-event', 'Shoppers browsing vendor tables at a holiday market inside Revelance'),
          ('', 'building-exterior-hero', 'Revelance at 8460 Duke Blvd, Mason, Ohio')]


def today():
    return datetime.date.fromisoformat(os.environ.get('SYNC_TODAY') or
                                       datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5))).date().isoformat())


def read(p):
    with open(p, encoding='utf-8') as fh:
        return fh.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(s)


def text(h):
    return H.unescape(re.sub(r'<[^>]+>', '', h)).strip()


def fmt_time(t):
    h, m = (int(x) for x in t.split(':'))
    ap = 'AM' if h < 12 else 'PM'
    h12 = h % 12 or 12
    return f'{h12}:{m:02d} {ap}'


def time_range(start, end):
    a, b = fmt_time(start), fmt_time(end)
    if a[-2:] == b[-2:]:
        a = a[:-3]
    return f'{a} – {b}'


def long_date(d):
    return d.strftime('%A, %B %-d, %Y')


def cards(events_html):
    """Upcoming cards as dicts, in page order."""
    out = []
    start = events_html.index('id="upcoming"')
    end = events_html.index('<!-- AUTO-HIDE PAST EVENTS', start)
    for m in CARD_RE.finditer(events_html[start:end]):
        cid, attrs, body = m.groups()
        a = dict(re.findall(r'(data-[a-z-]+)="([^"]*)"', attrs))
        a = {k: H.unescape(v) for k, v in a.items()}
        d = datetime.date.fromisoformat(a['data-event-date'])
        end_date = datetime.date.fromisoformat(a['data-event-end-date']) if a.get('data-event-end-date') else None
        last = end_date or d
        if last < today():
            continue
        meta = text(re.search(r'<div class="ev-meta">(.*?)</div>', body, re.S).group(1))
        host = re.search(r'Hosted by (.+)$', meta)
        badge = re.search(r'<span class="ev-badge ([a-z]+)">(.*?)</span>', body, re.S)
        paras = [re.sub(r'\s+', ' ', H.unescape(p)).strip() for p in re.findall(r'<p>(.*?)</p>', body, re.S)]
        paras = [re.sub(r'<(?!/?(a|em|strong)\b)[^>]+>', '', p) for p in paras]
        rsvp = None
        for href, label in re.findall(r'<a href="([^"]+)"[^>]*class="ev-btn"[^>]*>(.*?)</a>', body, re.S):
            lab = text(label)
            if 'Event Page' in lab or 'Recap' in lab:
                continue
            rsvp = (href, re.sub(r'^[^\w]+', '', lab).strip())
            break
        out.append(dict(id=cid, slug=cid[3:], title=a['data-event-title'], date=d, end_date=end_date,
                        start=a.get('data-event-time', ''), end=a.get('data-event-end', ''),
                        location=a.get('data-event-location', 'Revelance'), desc=a.get('data-event-desc', ''),
                        host=host.group(1).strip() if host else 'Revelance', meta=meta,
                        badge=text(badge.group(2)) if badge else 'Open to Public', badge_cls=badge.group(1) if badge else 'pub',
                        paras=paras or [a.get('data-event-desc', '')], rsvp=rsvp, page=a.get('data-event-page'),
                        drive=bool(end_date)))
    return out


def itemlist(events_html):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', events_html, re.S):
        if '"@type": "ItemList"' in m.group(1):
            return m
    sys.exit('events/index.html: no ItemList JSON-LD')


def schema_item(events_html, ev):
    for it in json.loads(itemlist(events_html).group(1))['itemListElement']:
        u = it['item']['url']
        if u.endswith('#' + ev['id']) or u.rstrip('/').endswith('/' + ev['slug']):
            return it['item']
    return None


def summary(ev):
    s = re.sub(r'\s+', ' ', ev['desc'] or ev['paras'][0]).replace('…', '').strip()
    base = f"{ev['title']} at Revelance in Mason, Ohio, {ev['date'].strftime('%B %-d')}. "
    room = 160 - len(base)
    if len(s) > room:
        s = s[:room].rsplit(' ', 1)[0].rstrip(',;:') + '.'
    out = base + s
    if len(out) < 50:
        out = base + 'Details, RSVP and directions.'
    return out[:160]


CSS = read(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'event_page.css')) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'event_page.css')) else ''


def hero_for(ev):
    key = (ev['location'] + ' ' + ev['title']).lower()
    for k, name, alt in HEROES:
        if k in key:
            return name, alt
    return HEROES[-1][1], HEROES[-1][2]


def facts_for(ev):
    fmt = {'ind': 'Live cooking demonstration and tasting', 'mem': 'Happy hour, come and go'}.get(ev['badge_cls'])
    if ev['drive']:
        fmt = 'Donation drive, drop off any time the building is open'
    who = {'ind': 'Foodservice operators, dealers, industry professionals', 'mem': 'Revelance members and invited guests'}.get(ev['badge_cls'], 'Everyone')
    cost = 'Free with registration' if ev['badge_cls'] == 'ind' else ('Free' if ev['rsvp'] is None else 'Free, RSVP requested')
    out = []
    if fmt:
        out.append(('Format', fmt))
    out += [('Who', who), ('Cost', cost), ('Parking', 'Free private lot, EV chargers')]
    return out


def og_image(ev, hero):
    """Render images/og-<slug>.jpg from the brand template (Playwright)."""
    out = os.path.join(ROOT, 'images', f'og-{ev["slug"]}.jpg')
    if os.path.exists(out):
        return out
    bg = os.path.join(ROOT, 'images', hero + '.jpg')
    when = long_date(ev['date']).split(', ', 1)[1].rsplit(',', 1)[0]
    if ev['drive']:
        when = f"{ev['date'].strftime('%B %-d')} – {ev['end_date'].strftime('%B %-d')}"
    elif ev['start']:
        when = f"{long_date(ev['date']).rsplit(',', 1)[0]} · {time_range(ev['start'], ev['end'])}"
    t1, _, t2 = ev['title'].partition(': ')
    eyebrow, title = (t1, t2) if t2 else (ev['host'] if ev['host'] != 'Revelance' else 'Revelance', ev['title'])
    size = 84 if len(title) <= 22 else (66 if len(title) <= 30 else 54)
    page = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,500&family=Outfit:wght@400;700&display=swap">
<style>html,body{{margin:0}}.c{{width:1200px;height:630px;position:relative;overflow:hidden;font-family:'Outfit',sans-serif;color:#fff;background:#0B0E11}}
.c img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.9)}}.c .sh{{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,14,17,.94) 0%,rgba(11,14,17,.82) 50%,rgba(11,14,17,.35) 100%)}}
.t{{position:absolute;left:80px;top:96px;right:120px}}.eb{{font-size:22px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#D4BA85;display:flex;align-items:center;gap:16px}}.eb::before{{content:'';width:40px;height:1px;background:#D4BA85}}
h1{{font-family:'Playfair Display',serif;font-weight:500;font-size:{size}px;line-height:1.08;margin:26px 0 0}}h1 em{{color:#D4BA85;font-style:italic}}
.d{{margin-top:28px;font-size:30px;color:rgba(255,255,255,.8)}}.l{{margin-top:10px;font-size:24px;color:rgba(255,255,255,.55)}}
.f{{position:absolute;left:80px;bottom:56px;font-size:22px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.5)}}.f b{{color:#D4BA85}}</style></head><body>
<div class="c"><img src="file://{bg}"><div class="sh"></div><div class="t"><div class="eb">{H.escape(eyebrow)}</div><h1><em>{H.escape(title)}</em></h1><div class="d">{H.escape(when)}</div><div class="l">{H.escape(ev["location"])} · Mason, Ohio</div></div><div class="f"><b>Revelance</b> &nbsp;·&nbsp; {H.escape(ev["badge"])}</div></div></body></html>'''
    with tempfile.TemporaryDirectory() as td:
        hp = os.path.join(td, 'og.html'); png = os.path.join(td, 'og.png')
        write(hp, page)
        js = os.path.join(td, 'og.js')
        write(js, "const{chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:630}});await p.goto('file://'+process.argv[2]);await p.waitForTimeout(1500);await p.screenshot({path:process.argv[3]});await b.close();})();")
        try:
            subprocess.check_call(['node', js, hp, png], cwd=ROOT)
            subprocess.check_call(['convert', png, '-quality', '86', '-strip', out])
        except Exception as e:  # noqa
            sys.exit(f'could not render {out}: {e}. Add the image by hand (1200x630) and rerun.')
    return out

GEO_META = '''<meta name="geo.region" content="US-OH">
  <meta name="geo.placename" content="Mason">
  <meta name="geo.position" content="39.3135;-84.3025">
  <meta name="ICBM" content="39.3135, -84.3025">'''


def build_page(ev, others, events_html):
    shell = read(SHELL)
    head = shell[:shell.index('</head>')]
    nav = shell[shell.index('<body>'):shell.index('<main id="main-content">')]
    tail = shell[shell.index('</main>') + len('</main>'):]
    tail = re.sub(r'<script>/\* RSVP: record which event.*?</script>\n?', '', tail, flags=re.S)
    hero, hero_alt = hero_for(ev)
    item = schema_item(events_html, ev) or {}
    img_url = item.get('image') if isinstance(item.get('image'), str) and item.get('image', '').startswith(SITE) else None
    if not img_url:
        img_url = SITE + '/images/' + os.path.basename(og_image(ev, hero))
    url = f'{SITE}/events/{ev["slug"]}/'
    title = f'{ev["title"]} | Revelance, Mason OH'
    if len(title) > 60:
        title = f'{ev["title"]} | Revelance'
    desc = summary(ev)
    esc = lambda s: H.escape(s, quote=True)
    h = head
    h = re.sub(r'<title>.*?</title>', f'<title>{esc(title)}</title>', h)
    h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', h)
    if 'geo.region' not in h:
        h = h.replace(f'<link rel="canonical" href="{url}">', f'<link rel="canonical" href="{url}">\n  ' + GEO_META)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', h)
    h = re.sub(r'<meta name="keywords" content="[^"]*">\n?', '', h)
    h = re.sub(r'<meta name="robots" content="noindex">', '<meta name="robots" content="index, follow, max-image-preview:large">', h)
    h = re.sub(r'<meta property="og:type" content="[^"]*">', '<meta property="og:type" content="article">', h)
    for prop, val in (('og:title', title), ('twitter:title', title), ('og:description', desc), ('twitter:description', desc), ('og:image', img_url), ('twitter:image', img_url), ('og:url', url)):
        h = re.sub(rf'<meta (property|name)="{prop}" content="[^"]*">', lambda m, p=prop, v=val: f'<meta {m.group(1)}="{p}" content="{esc(v)}">', h)
    assert 'noindex' not in h
    when_text = long_date(ev['date'])
    if ev['drive']:
        when_text = f"{ev['date'].strftime('%B %-d')} – {ev['end_date'].strftime('%B %-d, %Y')}"
        when_line = when_text
    else:
        when_line = f"{when_text} · {time_range(ev['start'], ev['end'])}" if ev['start'] else when_text
    tz = '-05:00'
    start_iso = f"{ev['date']}T{ev['start'] or '09:00'}:00{tz}"
    end_iso = f"{(ev['end_date'] or ev['date'])}T{(ev['end'] or '17:00') if not ev['drive'] else '23:59'}:00{tz}"
    ld = {"@context": "https://schema.org", "@type": "Event", "name": ev['title'], "description": desc,
          "startDate": start_iso, "endDate": end_iso, "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode", "url": url, "image": [img_url],
          "location": {"@type": "Place", "name": ev['location'].split(' · ')[0], "address": {"@type": "PostalAddress", "streetAddress": "8460 Duke Blvd", "addressLocality": "Mason", "addressRegion": "OH", "postalCode": "45040", "addressCountry": "US"}, "geo": {"@type": "GeoCoordinates", "latitude": 39.3135, "longitude": -84.3025}},
          "organizer": {"@type": "Organization", "name": ev['host'].split(' & ')[0], "url": SITE + '/'},
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock", "url": ev['rsvp'][0] if ev['rsvp'] else url},
          "isAccessibleForFree": True}
    h += '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>\n<style id="rv-event">' + CSS + '</style>\n'
    pic = (f'<picture><source srcset="../../images/{hero}-480.webp 480w, ../../images/{hero}-960.webp 960w, ../../images/{hero}-1200.webp 1200w, ../../images/{hero}.webp 1400w" sizes="(max-width:860px) 100vw, 480px" type="image/webp">'
           f'<img src="../../images/{hero}.jpg" alt="{esc(hero_alt)}" loading="eager" fetchpriority="high"></picture>')
    t1, _, t2 = ev['title'].partition(': ')
    h1 = f'{esc(t1)}: <em>{esc(t2)}</em>' if t2 else esc(ev['title'])
    paras = ''.join(f'<p>{p}</p>' for p in ev['paras'])
    facts = ''.join(f'<dt>{esc(k)}</dt><dd>{esc(v)}</dd>' for k, v in facts_for(ev))
    more = ''.join(f'<a class="card" href="../{o["slug"]}/"><div class="when">{esc(o["date"].strftime("%B %-d"))}{" – " + esc(o["end_date"].strftime("%B %-d")) if o["drive"] else ""}</div><div class="name">{esc(o["title"])}</div><div class="where">{esc(o["location"].split(" · ")[0])}{" · " + esc(time_range(o["start"], o["end"])) if o["start"] and not o["drive"] else ""}</div></a>' for o in others[:3])
    rsvp_btn = (f'<a class="btn btn-gold" href="{esc(ev["rsvp"][0])}" target="_blank" rel="noopener" onclick="try{{gtag(\'event\',\'event_rsvp_click\',{{event_name:{json.dumps(ev["title"])},link_url:this.href}})}}catch(e){{}}">\U0001F39F️ {esc(ev["rsvp"][1])}</a>'
                if ev['rsvp'] else '')
    space_href = {'culinary': '../../culinary-lab/', 'taproom': '../../taphouse/', 'c-suite': '../../c-suite/', 'revel room': '../../revel-room/'}
    sh = next((v for k, v in space_href.items() if k in ev['location'].lower()), '../../explore/')
    ics_desc = ev['paras'][0].replace(',', '\\,')
    passed_after = (ev['end_date'] or ev['date']).isoformat()
    main = f'''<main id="main-content">
<div class="evp">
<a class="back" href="../">&larr; All events</a>
<div class="evp-hero">
<div>
<span class="label">{esc(when_text)}</span>
<h1>{h1}</h1>
<span class="evp-badge {ev["badge_cls"]}">{esc(ev["badge"])}</span>
<div class="evp-past" id="evpPast">This event has passed. See <a href="../">what’s coming up</a> at Revelance.</div>
<dl class="evp-meta">
<dt>When</dt><dd>{esc(when_line)}</dd>
<dt>Where</dt><dd><a href="{sh}">{esc(ev["location"].split(" · ")[0])}</a>, 8460 Duke Blvd, Mason, OH 45040</dd>
<dt>Host</dt><dd>{esc(ev["host"])}</dd>
</dl>
<div class="evp-actions">
{rsvp_btn}
<button class="btn btn-line" type="button" id="evpCal">\U0001F4C5 Add to Calendar</button>
<button class="btn btn-line" type="button" id="evpShare">\U0001F517 Share</button>
</div>
</div>
{pic}
</div>
<div class="evp-body">
<div>
<h2>About <em>the event</em></h2>
{paras}
</div>
<aside class="evp-side">
<h3>At a glance</h3>
<dl>{facts}</dl>
<h3>Getting here</h3>
<address>Revelance<br>8460 Duke Blvd, Mason, OH 45040<br>About 25 minutes north of downtown Cincinnati, one mile off I-71.<br><a href="https://maps.google.com/?q=8460+Duke+Blvd+Mason+OH+45040" target="_blank" rel="noopener">Directions</a> &middot; <a href="tel:5137945070">513-794-5070</a></address>
</aside>
</div>
<div class="evp-more">
<span class="label">Also coming up</span>
<div class="grid">{more}</div>
</div>
</div>
<div class="evp-toast" id="evpToast" role="status" aria-live="polite"></div>
</main>
<script>
(function(){{
  var ev={{title:{json.dumps(ev["title"])},date:"{ev['date']}",last:"{passed_after}",start:"{ev['start'] or '09:00'}",end:"{(ev['end'] or '17:00')}",endDate:"{(ev['end_date'] or ev['date'])}",loc:{json.dumps(ev["location"].split(" · ")[0])},url:"{url}",desc:{json.dumps(ics_desc)}}};
  function toast(m){{var t=document.getElementById('evpToast');t.textContent=m;t.classList.add('show');setTimeout(function(){{t.classList.remove('show')}},2200);}}
  var today=new Intl.DateTimeFormat('en-CA',{{timeZone:'America/New_York'}}).format(new Date());
  if(today>ev.last){{document.getElementById('evpPast').style.display='block';}}
  document.getElementById('evpCal').addEventListener('click',function(){{
    var f=function(d){{return d.replace(/[-:]/g,'')}};
    var ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Revelance//Events//EN','BEGIN:VEVENT','DTSTART;TZID=America/New_York:'+f(ev.date+'T'+ev.start+':00'),'DTEND;TZID=America/New_York:'+f(ev.endDate+'T'+ev.end+':00'),'SUMMARY:'+ev.title,'DESCRIPTION:'+ev.desc+'\\\\n\\\\n'+ev.url,'LOCATION:'+ev.loc+'\\\\, 8460 Duke Blvd\\\\, Mason\\\\, OH 45040','URL:'+ev.url,'END:VEVENT','END:VCALENDAR'].join('\\r\\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{{type:'text/calendar;charset=utf-8'}}));a.download=ev.title.replace(/[^a-zA-Z0-9]/g,'-')+'.ics';a.click();URL.revokeObjectURL(a.href);toast('\U0001F4C5 Added to your calendar');
    try{{gtag('event','event_add_to_calendar',{{event_name:ev.title}})}}catch(e){{}}
  }});
  document.getElementById('evpShare').addEventListener('click',function(){{
    if(navigator.share){{navigator.share({{title:ev.title,url:ev.url}}).catch(function(){{}});return;}}
    navigator.clipboard.writeText(ev.url).then(function(){{toast('\U0001F517 Link copied')}});
  }});
}})();
</script>
'''
    return h + '</head>\n' + nav + main + tail, img_url


def wire_card(events_html, ev, img_url):
    """data-event-page, linked title, Event Page button, ItemList url/image."""
    s = events_html
    m = re.search(r'<div id="' + ev['id'] + r'" class="ev-card[^"]*"[^>]*?>', s)
    tag = m.group(0)
    if 'data-event-page' not in tag:
        s = s.replace(tag, tag[:-1] + f' data-event-page="/events/{ev["slug"]}/">', 1)
    i = s.index(f'<div id="{ev["id"]}"'); j = s.index('<h3>', i); k = s.index('</h3>', j)
    inner = s[j + 4:k]
    if '<a ' not in inner:
        s = s[:j] + f'<h3><a href="/events/{ev["slug"]}/" style="color:inherit;text-decoration:none">{inner}</a></h3>' + s[k + 5:]
    a = s.index('<div class="ev-actions">', i) + len('<div class="ev-actions">')
    if 'Event Page' not in s[i:a + 400]:
        s = s[:a] + f'\n<a href="/events/{ev["slug"]}/" class="ev-btn" style="text-decoration:none">\U0001F4C4 Event Page</a>' + s[a:]
    m = itemlist(s)
    j = json.loads(m.group(1))
    for it in j['itemListElement']:
        if it['item']['url'].endswith('#' + ev['id']):
            it['item']['url'] = f'{SITE}/events/{ev["slug"]}/'
            if not str(it['item'].get('image', '')).startswith(SITE):
                it['item']['image'] = img_url
    s = s[:m.start(1)] + json.dumps(j, indent=2, ensure_ascii=False) + s[m.end(1):]
    return s


def sitemap_add(slug):
    p = os.path.join(ROOT, 'sitemap.xml'); sm = read(p)
    loc = f'{SITE}/events/{slug}/'
    if loc + '<' in sm:
        return
    entry = f'<url><loc>{loc}</loc><lastmod>{today().isoformat()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n'
    i = sm.index('</urlset>'); write(p, sm[:i] + entry + sm[i:])


def missing(events_html):
    """Upcoming cards with no page file or no card wiring (what site_rules reports)."""
    out = []
    for ev in cards(events_html):
        page = os.path.join(ROOT, 'events', ev['slug'], 'index.html')
        if not os.path.exists(page):
            out.append((ev['id'], 'no page at /events/%s/' % ev['slug']))
        elif ev['page'] != f'/events/{ev["slug"]}/':
            out.append((ev['id'], 'card is not linked to its page (data-event-page)'))
    return out


def main(argv):
    events_html = read(EVENTS)
    if '--check' in argv:
        for cid, why in missing(events_html):
            print(f'{cid}: {why}')
        return 1 if missing(events_html) else 0
    force = argv[argv.index('--force') + 1] if '--force' in argv else None
    ups = cards(events_html)
    made = []
    for ev in ups:
        page = os.path.join(ROOT, 'events', ev['slug'], 'index.html')
        if os.path.exists(page) and ev['id'] != force:
            if ev['page'] != f'/events/{ev["slug"]}/':
                events_html = wire_card(events_html, ev, f'{SITE}/images/og-{ev["slug"]}.jpg')
                made.append(ev['slug'] + ' (card wired)')
            continue
        others = [o for o in ups if o is not ev]
        html_out, img_url = build_page(ev, others, events_html)
        write(page, html_out)
        events_html = wire_card(events_html, ev, img_url)
        sitemap_add(ev['slug'])
        made.append(ev['slug'])
    write(EVENTS, events_html)
    print('event pages:', ', '.join(made) if made else 'nothing to do')
    print('now run: python3 .github/scripts/sync_home_events.py && python3 .github/scripts/site_rules.py')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
