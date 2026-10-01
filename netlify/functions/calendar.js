// Netlify Function: calendar.js
// Proxies Google Calendar API requests server-side to avoid CORS issues

exports.handler = async function(event) {
  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  const CALENDAR_IDS = JSON.parse(process.env.CALENDAR_IDS || '[]');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const timeMin = params.timeMin || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const timeMax = params.timeMax || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();

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
          const errText = await res.text();
          return { name: cal.name, src: cal.src, status: res.status, error: errText.substring(0, 200), events: [] };
        }
        const data = await res.json();
        return { name: cal.name, src: cal.src, status: 200, events: data.items || [] };
      } catch (e) {
        return { name: cal.name, src: cal.src, status: 0, error: e.message, events: [] };
      }
    })
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ timeMin, timeMax, calendars: results }),
  };
};
