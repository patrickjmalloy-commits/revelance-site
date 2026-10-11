// Netlify Edge Function: event-schema-prune.js
// Keeps Google's event data current without anyone editing the pages.
// The home and events pages list upcoming events in JSON-LD (an ItemList of
// Event items). The visible lists already hide past events in the browser;
// this removes any Event whose end time has passed from that JSON-LD as the
// page is served. Everything else in the page is returned byte-for-byte, and
// any problem falls back to the original response.

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function isPast(ev, now) {
  if (!ev || ev['@type'] !== 'Event') return false;
  const t = Date.parse(ev.endDate || ev.startDate || '');
  return Number.isFinite(t) && t < now;
}

// Returns the new script body, '' to drop the block, or null to leave it alone.
function prune(json, now) {
  let data;
  try { data = JSON.parse(json); } catch { return null; }
  if (!data || data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) return null;
  const kept = data.itemListElement.filter((li) => !isPast(li && li.item ? li.item : li, now));
  if (kept.length === data.itemListElement.length) return null;
  if (!kept.length) return '';
  kept.forEach((li, i) => { if (li && typeof li === 'object' && 'position' in li) li.position = i + 1; });
  data.itemListElement = kept;
  if ('numberOfItems' in data) data.numberOfItems = kept.length;
  return JSON.stringify(data);
}

export default async (request, context) => {
  const res = await context.next();
  try {
    const type = res.headers.get('content-type') || '';
    if (res.status !== 200 || !type.includes('text/html')) return res;
    const html = await res.clone().text();
    const now = Date.now();
    let changed = false;
    const out = html.replace(LD, (block, body) => {
      const next = prune(body, now);
      if (next === null) return block;
      changed = true;
      return next === '' ? '' : '<script type="application/ld+json">' + next + '</script>';
    });
    if (!changed) return res;
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.delete('etag');
    return new Response(out, { status: res.status, headers });
  } catch (e) {
    console.error('event-schema-prune:', e && e.message);
    return res;
  }
};
