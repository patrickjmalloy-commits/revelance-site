// Blog URL canonicalization: 301 any /blog/*.html request to the extensionless
// canonical form (which the netlify.toml /blog/* → /blog/:splat.html rewrite then
// serves). Registered in netlify.toml on path /blog/* — blog only; never widen
// site-wide (404.html must keep serving as the 404 page).
// Added v6_183 per the Sep 23 GSC handoff: both URL forms returned 200, Google
// was flapping between them ("commercial kitchen for rent cincinnati" #2→#24).
export default async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/index.html')) {
    // /blog/index.html → /blog/ (not /blog/index, which would be a third variant)
    url.pathname = url.pathname.slice(0, -'index.html'.length);
    return Response.redirect(url, 301);
  }
  if (url.pathname.endsWith('.html')) {
    url.pathname = url.pathname.slice(0, -5);
    return Response.redirect(url, 301);
  }
  return context.next();
};
