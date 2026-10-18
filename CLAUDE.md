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
