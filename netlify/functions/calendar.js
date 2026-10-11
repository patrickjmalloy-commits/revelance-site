// Netlify Function: calendar.js
// Proxies Google Calendar API requests server-side to avoid CORS issues.
// Returns only what the availability views need (start/end; title and
// description only for Perfect Venue bookings, which are parsed for spaces),
// so attendee, organizer and other private event details never leave here.

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000; // about two months

function parseIso(v) {
  if (!v || typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function slim(ev, src) {
  const out = {
    start: { dateTime: ev.start && ev.start.dateTime, date: ev.start && ev.start.date },
    end: { dateTime: ev.end && ev.end.dateTime, date: ev.end && ev.end.date },
  };
  if (src === 'perfectvenue') {
    out.summary = ev.summary || '';
    out.description = ev.description || '';
  }
  return out;
}

exports.handler = async function(event) {
  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  const CALENDAR_IDS = JSON.parse(process.env.CALENDAR_IDS || '[]');

  // Same-origin only: the site calls this from its own pages, so no CORS header.
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const params = event.queryStringParameters || {};
  const now = new Date();
  let min = parseIso(params.timeMin) || new Date(now.getFullYear(), now.getMonth(), 1);
  let max = parseIso(params.timeMax) || new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (max <= min || max - min > MAX_RANGE_MS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid date range' }) };
  }
  const timeMin = min.toISOString();
  const timeMax = max.toISOString();

  const results = await Promise.all(
    CALENDAR_IDS.map(async (cal) => {
      const url = 'https://www.googleapis.com/calendar/v3/calendars/' +
        encodeURIComponent(cal.id) +
        '/events?key=' + API_KEY +
        '&timeMin=' + encodeURIComponent(timeMin) +
        '&timeMax=' + encodeURIComponent(timeMax) +
        '&singleEvents=true&maxResults=500';
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error('calendar: upstream', cal.name, res.status, (await res.text()).substring(0, 200));
          return { name: cal.name, src: cal.src, status: res.status, error: 'unavailable (' + res.status + ')', events: [] };
        }
        const data = await res.json();
        let items = data.items || [];
        if (cal.src === 'perfectvenue') {
          items = items.filter((ev) => String(ev.summary || '').toLowerCase().includes('(confirmed)'));
        }
        return { name: cal.name, src: cal.src, status: 200, events: items.map((ev) => slim(ev, cal.src)) };
      } catch (e) {
        console.error('calendar: fetch failed', cal.name, e && e.message);
        return { name: cal.name, src: cal.src, status: 0, error: 'unavailable', events: [] };
      }
    })
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ timeMin, timeMax, calendars: results }),
  };
};
