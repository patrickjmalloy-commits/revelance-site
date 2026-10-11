// Netlify Function: deploy-succeeded.js
// Runs automatically after every successful Netlify deploy. For production
// (main) deploys only, it tells Bing — and the other IndexNow search engines —
// which pages changed, so they re-crawl them within days instead of weeks.
// Google does not use IndexNow; resubmit the sitemap in Search Console for it.
//
// "Changed" = sitemap.xml URLs whose <lastmod> is within the last 14 days,
// plus the homepage. The key file at the site root proves the site owns it.

const HOST = 'revelanceoh.com';
const KEY = '42efc67bc4cb4c4ea5856edb9bbe1e8e';
const WINDOW_DAYS = 14;

exports.handler = async function(event) {
  let payload = {};
  try { payload = (JSON.parse(event.body || '{}').payload) || {}; } catch (e) {}

  // Branch deploys (staging) and deploy previews are skipped.
  if (payload.context !== 'production') {
    return { statusCode: 200, body: 'skipped: ' + (payload.context || 'unknown context') };
  }

  try {
    const res = await fetch('https://' + HOST + '/sitemap.xml');
    if (!res.ok) throw new Error('sitemap ' + res.status);
    const xml = await res.text();
    const cutoff = Date.now() - WINDOW_DAYS * 86400000;
    const urls = new Set(['https://' + HOST + '/']);
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1];
      const mod = (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) || [])[1];
      if (loc && loc.startsWith('https://' + HOST + '/') && mod && Date.parse(mod) >= cutoff) urls.add(loc);
    }
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: 'https://' + HOST + '/' + KEY + '.txt',
        urlList: [...urls].slice(0, 10000),
      }),
    });
    console.log('indexnow: submitted', urls.size, 'URLs, status', r.status);
    return { statusCode: 200, body: 'indexnow ' + r.status + ' (' + urls.size + ' URLs)' };
  } catch (e) {
    // Never fail the deploy over this; it's a best-effort nudge.
    console.error('indexnow: failed', e && e.message);
    return { statusCode: 200, body: 'indexnow failed (logged)' };
  }
};
