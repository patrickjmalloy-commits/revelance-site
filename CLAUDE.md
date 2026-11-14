# Revelance site

Static HTML site on Netlify. `staging` deploys to https://revelancestaging.netlify.app;
`main` is production (revelanceoh.com) and only moves when Patrick approves the
"Promote staging to production" workflow. Never push or merge to `main` directly.

## Adding an event

The card on events/index.html is the source of truth. Add the card (title,
date, start/end time, location, description, host, RSVP link, badge; drives
carry `data-event-end-date`), then:

    python3 .github/scripts/event_pages.py

That builds the event's own page at /events/<slug>/ (details, RSVP, Add to
Calendar, Share, directions, Event schema, auto "this event has passed"
notice), renders a brand share image at images/og-<slug>.jpg unless the card's
ItemList entry already names one on our domain, links the card to the page
(title, Event Page button, share buttons, schema url) and adds the sitemap
entry. Existing pages are kept; `--force ev-id` rebuilds one from its card.
Every promotion (social, email, Google Business Profile, the Facebook event)
links the event page, never an Eventbrite or AddEvent image or URL.

After the event: a recap post within two weeks where there is a story, with
a Read the Recap button on the card; delete the hidden homepage recap card
within two weeks (a site rule enforces it).

## Before pushing to staging

After any change to events/index.html, sync the homepage events grid from it
(the Events page is the source of truth; the homepage is generated):

    python3 .github/scripts/sync_home_events.py

Then run the site rules and fix anything they report:

    python3 .github/scripts/site_rules.py

The release workflow runs the same check and will not offer an approval
request while it fails.

## Site rules (enforced by the script above)

- **No breadcrumbs.** No "Home → Section → Page" trails anywhere, visible or as
  BreadcrumbList structured data.
- **No stray JavaScript.** Every script block needs its opening `<script>` tag.
- **Clean page structure.** Every opened tag (span, div, a, section, headings…) closes in order;
  a dropped opening tag shows up as broken text on the page, not as an error.
- **One gold palette:** `--gold #C9A96E`, `--gold-light #D4BA85` (gold text on dark
  sections), `--gold-dark #B08C4A` (gold text on light sections). Italic words in
  headings on gold banners are black.
- **Analytics:** every page that loads GA4 also runs `gtag('config','G-V2N2YENTZE')`,
  and every page with a phone or email link includes the `rv-contact-clicks` tracker.
- **Structured data:** every JSON-LD block is valid JSON, and every Event has name,
  startDate, endDate, location and offers (free events use a $0 offer).
- **Homepage events:** the grid carries every upcoming card the sync script picks
  from the Events page (run the script above if this fails).
- **Event pages:** every upcoming card has its own page at /events/<slug>/ and is
  linked to it (run `python3 .github/scripts/event_pages.py` if this fails).
- **Temporary content expires:** wrap any time-limited block (event callout,
  seasonal banner) in `<!-- ... remove after Sep 30, 2026 -->` and delete it by
  then; the rule fails once the date passes. Hidden homepage recap cards must be
  deleted within two weeks of the event.
- **Menu:** the About menu links "Explore the Building" and the Memberships menu
  links "Virtual Address".

## Deploy bundles

Bundles from the deploy-bundle artifact must be built from the current `staging`
branch. Before applying one, compare it with staging and do not apply a bundle that
reverts newer work.

## Private pages

`/staff/events/` is the owner's private event schedule. Event details come only from
`netlify/functions/events-admin.js`, after a server-side password check against the
`ADMIN_EVENTS_PASSWORD` environment variable. Keep it noindex, out of the sitemap and
menus, with no analytics; never put event details in static files.
