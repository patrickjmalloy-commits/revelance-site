// Netlify Function: events-admin.js
// Private event schedule for the owner (page: /staff/events/).
// Unlike calendar.js, which strips everything but times for the public
// availability page, this returns full event details — so every data request
// must carry a token that is only issued after the password check here, on the
// server. The password lives in the ADMIN_EVENTS_PASSWORD environment variable;
// changing it signs everyone out (tokens are signed with a key derived from it).
//
//   POST {password}                    -> {token, expires}   (12-hour token)
//   GET  ?timeMin&timeMax  + Bearer    -> {timeMin, timeMax, calendars:[...]}

const crypto = require('crypto');

const TOKEN_HOURS = 12;
const MAX_RANGE_MS = 100 * 24 * 60 * 60 * 1000; // a little over three months

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function signingKey(password) {
  const extra = process.env.ADMIN_EVENTS_SECRET || '';
  return crypto.createHash('sha256').update('revelance-events:' + extra + ':' + password).digest();
}
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeToken(password) {
  const exp = Date.now() + TOKEN_HOURS * 3600 * 1000;
  const body = b64url(JSON.stringify({ exp }));
  const sig = b64url(crypto.createHmac('sha256', signingKey(password)).update(body).digest());
  return { token: body + '.' + sig, expires: exp };
}

function tokenValid(token, password) {
  if (typeof token !== 'string' || token.length > 300 || token.indexOf('.') < 0) return false;
  const [body, sig] = token.split('.');
  const want = b64url(crypto.createHmac('sha256', signingKey(password)).update(body).digest());
  const a = Buffer.from(sig || ''), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch (e) {
    return false;
  }
}

function passwordMatches(given, actual) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(actual)).digest();
  return crypto.timingSafeEqual(a, b);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseIso(v) {
  if (!v || typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function detail(ev) {
  return {
    id: ev.id,
    summary: ev.summary || '',
    description: String(ev.description || '').slice(0, 6000),
    location: ev.location || '',
    status: ev.status || '',
    start: { dateTime: ev.start && ev.start.dateTime, date: ev.start && ev.start.date },
    end: { dateTime: ev.end && ev.end.dateTime, date: ev.end && ev.end.date },
    link: ev.htmlLink || '',
    updated: ev.updated || '',
  };
}

exports.handler = async function (event) {
  const PASSWORD = process.env.ADMIN_EVENTS_PASSWORD;
  if (!PASSWORD || PASSWORD.length < 8) return reply(503, { error: 'not_configured' });

  if (event.httpMethod === 'POST') {
    let given = '';
    try { given = JSON.parse(event.body || '{}').password; } catch (e) { /* treated as wrong */ }
    if (!passwordMatches(given, PASSWORD)) {
      await sleep(900); // slows down guessing
      return reply(401, { error: 'wrong_password' });
    }
    return reply(200, makeToken(PASSWORD));
  }

  if (event.httpMethod !== 'GET') return reply(405, { error: 'method_not_allowed' });

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!tokenValid(token, PASSWORD)) return reply(401, { error: 'signed_out' });

  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  let CALENDAR_IDS = [];
  try { CALENDAR_IDS = JSON.parse(process.env.CALENDAR_IDS || '[]'); } catch (e) { /* handled below */ }
  if (!API_KEY || !CALENDAR_IDS.length) return reply(503, { error: 'calendar_not_configured' });

  const q = event.queryStringParameters || {};
  const now = new Date();
  const min = parseIso(q.timeMin) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = parseIso(q.timeMax) || new Date(min.getTime() + 30 * 86400000);
  if (max <= min || max - min > MAX_RANGE_MS) return reply(400, { error: 'invalid_range' });

  const calendars = await Promise.all(CALENDAR_IDS.map(async (cal) => {
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.id) +
      '/events?key=' + API_KEY + '&timeMin=' + encodeURIComponent(min.toISOString()) +
      '&timeMax=' + encodeURIComponent(max.toISOString()) + '&singleEvents=true&orderBy=startTime&maxResults=1000';
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('events-admin: upstream', cal.name, res.status);
        return { name: cal.name, src: cal.src || '', error: 'unavailable (' + res.status + ')', events: [] };
      }
      const data = await res.json();
      const events = (data.items || []).filter((ev) => ev.status !== 'cancelled').map(detail);
      return { name: cal.name, src: cal.src || '', events };
    } catch (e) {
      console.error('events-admin: fetch failed', cal.name, e && e.message);
      return { name: cal.name, src: cal.src || '', error: 'unavailable', events: [] };
    }
  }));

  return reply(200, { timeMin: min.toISOString(), timeMax: max.toISOString(), calendars });
};
