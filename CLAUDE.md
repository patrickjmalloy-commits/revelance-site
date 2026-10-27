# Revelance site

Static HTML site on Netlify. `staging` deploys to https://revelancestaging.netlify.app;
`main` is production (revelanceoh.com) and only moves when Patrick approves the
"Promote staging to production" workflow. Never push or merge to `main` directly.

## Before pushing to staging

Run the site rules and fix anything they report:

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
