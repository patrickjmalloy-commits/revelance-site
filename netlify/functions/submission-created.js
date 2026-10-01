// Netlify Function: submission-created.js
// Fires automatically on every Netlify Forms submission.
// Handles the full free-day-pass lifecycle:
//   free-day-pass → welcome email(s) + 30-day expiration + either a
//                   morning-of reminder (date given) or a 3-email drip
//                   (day 7 / 16 / 27) when no date was picked
//   pick-a-day    → reschedule: cancel pending emails, set new date,
//                   extend expiration if needed, confirm + new reminder
//   check-in      → cancel pending emails, schedule next-morning follow-up
// Every guest email BCCs the team inbox so the front desk sees each send.
// No-ops safely if RESEND_API_KEY is not configured.

const SITE = (process.env.URL || 'https://revelanceoh.com').replace(/\/$/, '');

const BRAND = {
  from: 'Revelance <info@revelanceoh.com>',
  replyTo: 'info@revelanceoh.com',
  notify: 'info@revelanceoh.com', // BCC on every guest email
};

// Brand lockup embedded as an inline attachment (cid) so Outlook and other
// clients that block remote images still show the logo. 494x96 PNG, ~13KB.
const LOGO_B64 = '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';

// ── Date helpers (all Eastern) ─────────────────────────────────────────────
function visitParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}
function todayEastern() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
// today + n days, as YYYY-MM-DD
function addDaysEastern(n) {
  const p = visitParts(todayEastern());
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d + n, 12));
  return dt.toISOString().slice(0, 10);
}
function prettyVisit(s) {
  const p = visitParts(s); if (!p) return '';
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function usVisit(s) {
  const p = visitParts(s); if (!p) return '';
  return ('0' + p.mo).slice(-2) + '/' + ('0' + p.d).slice(-2) + '/' + p.y;
}
// MM/DD/YYYY (from the Sheet) → YYYY-MM-DD
function isoFromUs(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? m[3] + '-' + m[1] + '-' + m[2] : '';
}
function etOffset(mo) { return (mo >= 4 && mo <= 10) ? '-04:00' : '-05:00'; }
// 7:30 AM ET on the given day, ISO 8601 with offset.
function morningOfEastern(s) {
  const p = visitParts(s); if (!p) return null;
  return s + 'T07:30:00' + etOffset(p.mo);
}
function nineAmEasternOn(s) {
  const p = visitParts(s); if (!p) return null;
  return s + 'T09:00:00' + etOffset(p.mo);
}
// 'future' (schedulable via Resend, <=29 days out), 'far' (valid but beyond
// the scheduling window — record it, skip the reminder), 'today', or null.
function visitStatus(s) {
  const p = visitParts(s); if (!p) return null;
  const today = todayEastern();
  if (s === today) return 'today';
  if (s > today) {
    const diff = (Date.UTC(p.y, p.mo - 1, p.d) - Date.parse(today + 'T00:00:00Z')) / 86400000;
    return diff <= 29 ? 'future' : 'far';
  }
  return null;
}
// A YYYY-MM-DD that lands on a weekend moves to the following Monday.
function businessDay(s) {
  const p = visitParts(s); if (!p) return s;
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay();
  const bump = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  if (!bump) return s;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d + bump, 12)).toISOString().slice(0, 10);
}
// 9 AM Eastern, n days out — weekend landings pushed to the next business day.
// (Morning-of visit reminders are exempt: they fire on the day the guest chose.)
function nineAmBusinessDay(daysOut) {
  return nineAmEasternOn(businessDay(addDaysEastern(daysOut)));
}

function pickDayUrl(code, email, name) {
  return SITE + '/pick-a-day/?code=' + encodeURIComponent(code || '') +
    '&email=' + encodeURIComponent(email || '') + '&name=' + encodeURIComponent(name || '');
}

// ── Resend ─────────────────────────────────────────────────────────────────
// Returns the Resend email id (needed to cancel scheduled sends), or null.
async function sendEmail(KEY, to, subject, html, scheduledAt) {
  const body = { from: BRAND.from, reply_to: BRAND.replyTo, to: [to], bcc: [BRAND.notify], subject: subject, html: html };
  if (html.indexOf('cid:revlogo') !== -1) {
    body.attachments = [{ filename: 'revelance.png', content: LOGO_B64, content_type: 'image/png', content_id: 'revlogo' }];
  }
  if (scheduledAt) body.scheduled_at = scheduledAt;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error('resend:', res.status, await res.text().catch(function(){return '';})); return null; }
  const j = await res.json().catch(function(){ return {}; });
  return j.id || null;
}
async function cancelEmails(KEY, ids) {
  for (const id of ids) {
    if (!id) continue;
    try {
      const res = await fetch('https://api.resend.com/emails/' + encodeURIComponent(id) + '/cancel', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + KEY },
      });
      console.log('resend cancel', id, res.status);
    } catch (e) { console.error('resend cancel failed:', id, e && e.message); }
  }
}

// ── Shared email chrome (table-based — Outlook's Word engine fragments divs) ─
const LABEL = 'font-size:11px;letter-spacing:3px;color:#B08C4A;text-transform:uppercase;font-weight:bold;font-family:Arial,Helvetica,sans-serif;';
const BODYFONT = "font-family:Arial,Helvetica,sans-serif;";
// Bulletproof button: table cell carries the background so Outlook renders it.
function btn(href, text, opts) {
  opts = opts || {};
  const solid = !opts.outline;
  const bg = solid ? '#C9A96E' : '#FFFFFF';
  const color = solid ? '#0B0E11' : '#B08C4A';
  const border = opts.outline ? 'border:2px solid #C9A96E;' : '';
  const align = opts.align || 'center';
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" style="${align === 'center' ? 'margin:0 auto;' : ''}"><tr><td bgcolor="${bg}" style="${border}border-radius:6px;mso-padding-alt:12px 26px;"><a href="${href}" style="display:inline-block;padding:12px 26px;${BODYFONT}font-size:13px;font-weight:bold;color:${color};text-decoration:none;">${text}</a></td></tr></table>`;
}
function shell(preheader, headline, inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F4F5F6;">
<div style="display:none;font-size:1px;color:#F4F5F6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#F4F5F6"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
  <tr><td height="6" bgcolor="#C9A96E" style="font-size:0px;line-height:0px;">&nbsp;</td></tr>
  <tr><td bgcolor="#0B0E11" style="padding:30px 34px 26px;">
    <img src="cid:revlogo" alt="REVELANCE" width="247" height="48" style="display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;letter-spacing:6px;color:#FFFFFF;" />
    <div style="color:#F4F5F6;font-size:26px;line-height:1.3;font-family:Georgia,'Times New Roman',serif;margin-top:16px;">${headline}</div>
  </td></tr>
  <tr><td bgcolor="#FFFFFF" style="padding:30px 34px;${BODYFONT}">
${inner}
  </td></tr>
</table>
<table role="presentation" width="560" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;"><tr><td align="center" style="${BODYFONT}font-size:12px;color:#5A6572;padding:20px 0;">Revelance · 8460 Duke Blvd, Mason, OH 45040 · <a href="https://revelanceoh.com" style="color:#B08C4A;">revelanceoh.com</a></td></tr></table>
</td></tr></table></body></html>`;
}
function codeBox(code, ctaHref, ctaText, underNote) {
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td bgcolor="#F4F5F6" align="center" style="border:1px solid #E8EAED;border-radius:10px;padding:22px;">
      <div style="${LABEL}">Your Pass Code</div>
      <div style="font-size:32px;font-weight:bold;color:#B08C4A;letter-spacing:3px;margin-top:8px;font-family:Georgia,'Times New Roman',serif;">${code}</div>
      <div style="height:14px;font-size:0;line-height:0;">&nbsp;</div>
      ${btn(ctaHref, ctaText)}
      ${underNote ? '<div style="font-size:12px;color:#5A6572;margin-top:10px;' + BODYFONT + '">' + underNote + '</div>' : ''}
    </td></tr></table>`;
}

// ── Welcome email ──────────────────────────────────────────────────────────
function passEmail(name, code, isColleague, inviterName, visitPretty, expiresPretty, email, withReminder) {
  const first = (name || 'there').split(' ')[0];
  const pdUrl = pickDayUrl(code, email, name);
  const intro = isColleague
    ? '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3A4450;">' + (inviterName || 'A colleague') + ' invited you to spend a free day at Revelance — Mason, Ohio’s private business club. Your own day pass is below.</p>'
    : '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3A4450;">Your free day pass is confirmed. No catch, no credit card — a full day to work from the club, grab a RoboJo coffee, and see what Revelance is all about.</p>';
  const fwd = isColleague ? '' : '<p style="font-size:14px;color:#3A4450;line-height:1.7;margin:16px 0 0;"><strong>First days are better with company.</strong> Forward this to a colleague — they can claim their own free pass at <a href="https://revelanceoh.com/#free-day" style="color:#B08C4A;">revelanceoh.com</a>.</p>';
  const remind = withReminder ? ' We’ll send a reminder with everything that morning.' : '';
  const whenRow = visitPretty
    ? '<tr><td style="padding:4px 0;"><strong>Your day:</strong> ' + visitPretty + ' — we’re staffed 8am–6pm, arrive whenever suits you.' + remind + ' <a href="' + pdUrl + '" style="color:#B08C4A;">Plans change? Pick a new day</a>.</td></tr>'
    : '<tr><td style="padding:4px 0;"><strong>When to come:</strong> Any staffed weekday, Mon–Fri 8am–6pm. <a href="' + pdUrl + '" style="color:#B08C4A;font-weight:bold;">Pick your day</a> and we’ll send a reminder that morning with everything you need.</td></tr>';
  const expRow = expiresPretty
    ? '<tr><td style="padding:4px 0;"><strong>Good through:</strong> ' + expiresPretty + ' — use it any day before then. Picking a day past that date automatically extends your pass.</td></tr>' : '';
  const inner = `${intro}
    ${codeBox(code, SITE + '/thank-you/?form=free-day-pass&code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(name || ''), 'View or Print My Pass', 'Show this when you arrive.')}
    <table style="width:100%;font-size:14px;color:#3A4450;line-height:1.75;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 0;"><strong>Where:</strong> <a href="https://maps.google.com/?q=8460+Duke+Blvd+Mason+OH+45040" style="color:#B08C4A;">8460 Duke Blvd, Mason, OH 45040</a> — about a mile off I-71</td></tr>
      <tr><td style="padding:4px 0;"><strong>Parking:</strong> Free in our private lot (EV chargers available)</td></tr>
      ${whenRow}
      ${expRow}
      <tr><td style="padding:4px 0;"><strong>When you arrive:</strong> Scan the QR code at the front desk to check in — it takes about 30 seconds — or use the button below and your check-in form is already filled out for you.</td></tr>
      <tr><td style="padding:10px 0 2px;">${btn(SITE + '/check-in/?code=' + encodeURIComponent(code), 'Check In When You Arrive', {outline:true, align:'left'})}</td></tr>
    </table>
    <div style="margin:24px 0 0;padding-top:20px;border-top:1px solid #E8EAED;">
      <div style="${LABEL} margin-bottom:12px;">Make the Most of Your Day</div>
      <table style="width:100%;font-size:14px;color:#3A4450;line-height:1.75;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;">☕ <strong>RoboJo Coffee Bar</strong> — our robotic barista, featuring Script Coffee. Download the app to pre-order, print custom latte art from your camera roll, and earn rewards: <a href="https://apps.apple.com/us/app/myappcaf%C3%A9/id1567580725" style="color:#B08C4A;">iPhone</a> · <a href="https://play.google.com/store/apps/details?id=de.myappcafe.myappcafe.myAppCafe_android&hl=en-US" style="color:#B08C4A;">Android</a></td></tr>
        <tr><td style="padding:5px 0;">🥤 <strong>Fresh Blends bar</strong> — fresh fruit smoothies just $2, plus shakes and frozen lemonades in the Co-Revel Café</td></tr>
        <tr><td style="padding:5px 0;">🚪 <strong>Phone booths</strong> — private, first-come, no reservation needed for your calls</td></tr>
        <tr><td style="padding:5px 0;">🍺 <strong>The Taproom</strong> — when it’s open, Sonder Brewing on tap downstairs</td></tr>
      </table>
      <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:16px 0 0;">Curious what membership looks like? <a href="https://revelanceoh.com/coworking/" style="color:#B08C4A;">See the Co-Revel floor and plans</a>.</p>
    </div>
    ${fwd}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:18px 0 0;">Questions before your visit? Reply to this email or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>.</p>`;
  return shell('Your pass code, parking, and hours — everything for your visit is inside.',
    'Your free day pass, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.', inner);
}

// ── Morning-of reminder (scheduled 7:30 AM ET on the visit day) ────────────
function morningEmail(name, code, email) {
  const first = (name || 'there').split(' ')[0];
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">We’re looking forward to seeing you at the club today. Here’s everything you need — it takes about 30 seconds from the parking lot to a desk.</p>
    ${codeBox(code, SITE + '/check-in/?code=' + encodeURIComponent(code), 'Check In — Already Filled Out For You', 'Or scan the QR code at the front desk when you walk in.')}
    <div style="${LABEL} margin-bottom:10px;">What to Expect</div>
    <table style="width:100%;font-size:14px;color:#3A4450;line-height:1.75;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 0;">📍 <strong>Find us:</strong> <a href="https://maps.google.com/?q=8460+Duke+Blvd+Mason+OH+45040" style="color:#B08C4A;">8460 Duke Blvd, Mason, OH 45040</a> — about a mile off I-71</td></tr>
      <tr><td style="padding:4px 0;">🚗 <strong>Park free</strong> in our private lot (EV chargers available), then come in the main entrance</td></tr>
      <tr><td style="padding:4px 0;">🕒 <strong>We’re staffed 8am–6pm</strong> — arrive whenever suits your day</td></tr>
      <tr><td style="padding:4px 0;">☕ <strong>Start with a coffee</strong> — the RoboJo robotic coffee bar is pouring in the lobby</td></tr>
      <tr><td style="padding:4px 0;">💻 <strong>Work anywhere</strong> on the Co-Revel floor — desks, phone booths, and the café are all yours today</td></tr>
    </table>
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:18px 0 0;">Can’t make it today after all? <a href="${pickDayUrl(code, email, name)}" style="color:#B08C4A;font-weight:bold;">Pick a new day here</a> — it takes ten seconds. Running late or need directions? Reply to this email or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>. See you soon.</p>`;
  return shell('Your pass code, parking, and the 30-second check-in — see you soon.',
    'Today’s the day, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.', inner);
}

// ── Drip reminders when no visit date was picked ───────────────────────────
function tickleEmail(name, code, email, stage, expiresPretty) {
  const first = (name || 'there').split(' ')[0];
  const pdUrl = pickDayUrl(code, email, name);
  const pickBtn = '<div style="margin:0 0 22px;">' + btn(pdUrl, 'Pick My Day — 10 Seconds') + '</div>';
  let headline, pre, body;
  if (stage === 1) {
    headline = 'Your day is waiting, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.';
    pre = 'A full day at the club, on us — pick the day that fits.';
    body = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">A week ago you claimed a free day at Revelance — it’s still yours, no strings, good through <strong>${expiresPretty}</strong>. The only thing missing is a date.</p>
    ${pickBtn}
    <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#3A4450;">Pick your day and we’ll send a reminder that morning with your pass code and a one-tap check-in — you’ll be at a desk with a RoboJo coffee two minutes after you park.</p>`;
  } else if (stage === 2) {
    headline = 'Still saving you a seat, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.';
    pre = 'Desks, phone booths, robot coffee, and a taproom downstairs — pick your day.';
    body = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">Here’s what a day on your pass actually looks like: a desk on the Co-Revel floor (never bumped for events), private phone booths for your calls, the RoboJo robotic coffee bar downstairs, Fresh Blends smoothies in the café — and, on Taproom days, Sonder Brewing when you wrap up.</p>
    ${pickBtn}
    <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#3A4450;">Your pass is good through <strong>${expiresPretty}</strong>. Most people say the hardest part is going back to the coffee shop afterward.</p>`;
  } else {
    headline = 'Your pass expires soon, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.';
    pre = 'Expires ' + expiresPretty + ' — picking a day automatically extends it.';
    body = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">Quick heads-up: your free day pass expires on <strong>${expiresPretty}</strong>. You haven’t used it yet — and we’d hate for it to slip away.</p>
    ${pickBtn}
    <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#3A4450;"><strong>Want more time?</strong> Pick any day — even one past the expiration — and your pass extends to that day automatically. Or just reply to this email with the day that works and we’ll set it up for you.</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#3A4450;">And if it does lapse, no hard feelings — you can always claim a fresh pass at <a href="https://revelanceoh.com/#free-day" style="color:#B08C4A;">revelanceoh.com</a>.</p>`;
  }
  const inner = `${body}
    ${codeBox(code, pdUrl, 'Pick My Day', 'Your pass code — show it when you arrive.')}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:0;">Questions? Reply to this email or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>.</p>`;
  return shell(pre, headline, inner);
}

// ── Reschedule confirmation ────────────────────────────────────────────────
function rescheduleConfirmEmail(name, code, email, visitPretty, expiresPretty, withReminder) {
  const first = (name || 'there').split(' ')[0];
  const expLine = expiresPretty
    ? '<p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#3A4450;">Your pass is good through <strong>' + expiresPretty + '</strong>.</p>' : '';
  const followLine = withReminder
    ? ' We’ll send a reminder that morning with your pass code, parking info, and a one-tap check-in.'
    : ' Your pass code below is all you need — keep this email handy for the day.';
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">You’re on the calendar for <strong>${visitPretty}</strong>.${followLine}</p>
    ${codeBox(code, SITE + '/check-in/?code=' + encodeURIComponent(code), 'Check In When You Arrive', 'Show this when you arrive.')}
    ${expLine}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:0;">Need to change it again? <a href="${pickDayUrl(code, email, name)}" style="color:#B08C4A;">Pick a different day anytime</a>, reply to this email, or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>.</p>`;
  return shell('You’re booked for ' + visitPretty + ' — everything you need is inside.',
    'See you <span style="color:#D4BA85;font-style:italic;">' + visitPretty + '</span>.', inner);
}

// ── Walk-in welcome: checked in at the door with no prior signup ─────────
function walkInEmail(name) {
  const first = (name || 'there').split(' ')[0];
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">You’re checked in — welcome to Mason’s private business club. The whole day is yours: find a seat anywhere on the Co-Revel floor and make yourself at home.</p>
    <div style="${LABEL} margin-bottom:12px;">Make the Most of Your Day</div>
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3A4450;line-height:1.75;">
      <tr><td style="padding:5px 0;">☕ <strong>RoboJo Coffee Bar</strong> — our robotic barista in the lobby, featuring Script Coffee</td></tr>
      <tr><td style="padding:5px 0;">\ud83e\udd64 <strong>Fresh Blends bar</strong> — fresh fruit smoothies just $2 in the Co-Revel Caf\u00e9</td></tr>
      <tr><td style="padding:5px 0;">\ud83d\udeaa <strong>Phone booths</strong> — private, first-come, no reservation needed</td></tr>
      <tr><td style="padding:5px 0;">\ud83c\udf7a <strong>The Taproom</strong> — when it’s open, Sonder Brewing on tap downstairs</td></tr>
    </table>
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:18px 0 22px;">Like what you see? Day passes are $29 whenever you want to come back, and <a href="https://revelanceoh.com/memberships/" style="color:#B08C4A;">memberships start at $179/month</a> for unlimited days like this one.</p>
    ${btn('https://revelanceoh.com/memberships/', 'See Memberships')}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:22px 0 0;">Need anything today? Flag down any team member, reply to this email, or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>.</p>`;
  return shell('You’re in — here’s everything the building has for you today.',
    'Welcome to the club, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.', inner);
}

// ── New-member application received ────────────────────────────────────────
function newMemberEmail(name, membership, startPretty) {
  const first = (name || 'there').split(' ')[0];
  const tierLine = membership ? `<tr><td style="padding:5px 0;">🏆 <strong>Membership:</strong> ${membership}</td></tr>` : '';
  const startLine = startPretty ? `<tr><td style="padding:5px 0;">📅 <strong>Requested start date:</strong> ${startPretty}</td></tr>` : '';
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">Your membership form is in — thank you. Our team is setting up your membership now, and here’s exactly what happens next.</p>
    <div style="${LABEL} margin-bottom:12px;">What Happens Next</div>
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3A4450;line-height:1.75;">
      <tr><td style="padding:5px 0;">1&#65039;&#8419; &nbsp;The Revelance team activates your membership</td></tr>
      <tr><td style="padding:5px 0;">2&#65039;&#8419; &nbsp;You’ll receive your <strong>member portal invitation</strong> by email</td></tr>
      <tr><td style="padding:5px 0;">3&#65039;&#8419; &nbsp;Add your payment details there — entered directly into our billing system, fully encrypted (we never handle your card or bank numbers)</td></tr>
      <tr><td style="padding:5px 0;">4&#65039;&#8419; &nbsp;Welcome to the club — building access, the app, and your first RoboJo coffee await</td></tr>
    </table>
    ${(tierLine || startLine) ? `<div style="${LABEL} margin:20px 0 12px;">Your Selections</div>
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3A4450;line-height:1.75;">${tierLine}${startLine}</table>` : ''}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:22px 0 0;">Questions in the meantime? Reply to this email or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a> — we’re happy to help.</p>`;
  return shell('Your membership form is in — here’s what happens next.',
    'Welcome to the club, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.', inner);
}

// ── Shared "more than coworking" block (events education) ─────────────────
function eventsBlock() {
  return `<div style="${LABEL} margin:24px 0 12px;">More Than Coworking</div>
    <p style="font-size:14px;color:#3A4450;line-height:1.75;margin:0 0 10px;">Revelance is also Mason’s event venue — the <strong>Revel Room</strong> hosts up to 225 for corporate parties and celebrations, the boardrooms take client meetings up a level, <strong>Emergency 9</strong> turns a team offsite into a golf outing, and the <strong>Culinary Lab</strong> hosts private chef experiences. Company retreat, client event, rehearsal dinner, shower, holiday party — if it matters, it fits here.</p>
    <p style="font-size:14px;line-height:1.7;margin:0;"><a href="https://revelanceoh.com/plan-your-event/" style="color:#B08C4A;">Plan an event at Revelance →</a></p>`;
}

// ── Guest welcome: checked in to meet someone — concierge tone, no pitch ───
function guestWelcomeEmail(name) {
  const first = (name || 'there').split(' ')[0];
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">You’re checked in — welcome to Mason’s private business club. While you’re here, a few things worth knowing about the building:</p>
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3A4450;line-height:1.75;">
      <tr><td style="padding:5px 0;">☕ <strong>RoboJo Coffee Bar</strong> — our robotic barista in the lobby, featuring Script Coffee. <a href="https://revelanceoh.com/blog/robojo-coffee-app-preorder-latte-art-rewards.html" style="color:#B08C4A;">Grab the RoboJo app</a> to preorder.</td></tr>
      <tr><td style="padding:5px 0;">\ud83e\udd64 <strong>Fresh fruit smoothies — just $2</strong> at the Fresh Blends bar in the Co-Revel Caf\u00e9</td></tr>
      <tr><td style="padding:5px 0;">\ud83d\udeaa <strong>Phone booths</strong> — private, first-come, no reservation needed</td></tr>
      <tr><td style="padding:5px 0;">\ud83c\udf7a <strong>The Taproom</strong> — when it’s open, Sonder Brewing on tap downstairs</td></tr>
    </table>
    ${eventsBlock()}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:22px 0 0;">Need anything during your visit? Flag down any team member or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>. Enjoy the meeting.</p>`;
  return shell('You’re checked in — a few things worth knowing while you’re in the building.',
    'Welcome to Revelance, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>.', inner);
}

// ── Guest day-3 follow-up: free work week offer ────────────────────────────
function guestFollowUpEmail(name) {
  const first = (name || 'there').split(' ')[0];
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">You were in the building this week for a meeting — here’s an open invitation to try it as your own office.</p>
    <div style="background:#F4F5F6;border:1px solid #E8EAED;border-left:3px solid #C9A96E;border-radius:8px;padding:16px 18px;margin:0 0 22px;">
      <p style="margin:0 0 10px;font-size:15px;color:#3A4450;line-height:1.7;"><strong>A free work week at Revelance</strong> — Monday through Friday, 8 AM–6 PM. The Co-Revel floor, RoboJo coffee, phone booths, all of it. No card, no strings.</p>
      <p style="margin:0;font-size:14px;color:#3A4450;line-height:1.7;">\ud83d\udcc5 Reply with the Monday you’d like to start — <strong>any Monday in the next 30 days</strong> — and the team will confirm and have everything ready. We’ll let you in each morning; no key needed.</p>
    </div>
    <div style="margin:0 0 22px;">${btn('https://revelanceoh.com/coworking/', 'See the Co-Revel Floor')}</div>
    ${eventsBlock()}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:22px 0 0;">Questions? Just reply — this inbox reaches the team directly.</p>`;
  return shell('The building you visited — yours for a work week, on us.',
    'Come work a week <span style="color:#D4BA85;font-style:italic;">on us</span>, ' + first + '.', inner);
}

// ── Day-after-check-in follow-up (unchanged) ───────────────────────────────
function followUpEmail(name, interest) {
  const first = (name || 'there').split(' ')[0];
  const pitches = {
    'Executive Office ($1,599/mo)': {
      body: 'You mentioned the <strong>Executive Offices</strong> — fair warning, only <strong>two remain</strong>. A private office with the whole club wrapped around it: boardrooms, the Taproom, RoboJo, free parking, all of it. If yesterday felt right, it’s worth holding one before they’re gone.',
      cta: 'Ask About the Last Two Offices', url: 'https://revelanceoh.com/?interest=Executive+Office#contact' },
    'Dedicated Desk ($449/mo)': {
      body: 'You mentioned the <strong>Dedicated Desk</strong> — your own permanent spot on the Co-Revel floor, monitor and all, plus access to the members-only Cornerstone Boardroom. $449/month, no long commitment. The desk you liked yesterday could just stay yours.',
      cta: 'Claim a Dedicated Desk', url: 'https://revelanceoh.com/?interest=Dedicated+Desk#contact' },
    'Co-Revel Membership ($179/mo)': {
      body: 'You spent the day on the <strong>Co-Revel floor</strong> — that’s the membership. $179/month for unlimited days exactly like yesterday: dedicated workspace that never gets bumped for events, RoboJo coffee, phone booths, and the Taproom downstairs. Less than most people spend working out of coffee shops.',
      cta: 'See Co-Revel Membership', url: 'https://revelanceoh.com/memberships/#memberships' },
    'Corporate Account (for teams)': {
      body: 'You mentioned a <strong>Corporate Account</strong> — a pre-funded, flexible setup your whole team can draw on for day passes, boardrooms, and event space. It takes about fifteen minutes to scope. Reply to this email and Patrick will set it up around your schedule.',
      cta: 'Talk Corporate Accounts', url: 'https://revelanceoh.com/corporate/' },
  };
  const p = pitches[interest] || {
    body: 'No pitch, just a thank-you — we hope the club treated you well. If a day like yesterday would help more often, day passes are $29 and Co-Revel membership is $179/month for unlimited days. Either way, you’re welcome back anytime.',
    cta: 'See Memberships', url: 'https://revelanceoh.com/memberships/#memberships' };
  const inner = `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#3A4450;">Thanks for spending a day with us at Revelance — we hope the coffee was good and the work came easy.</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#3A4450;">${p.body}</p>
    <div style="margin:0 0 22px;">${btn(p.url, p.cta)}</div>
    <div style="background:#F4F5F6;border:1px solid #E8EAED;border-left:3px solid #C9A96E;border-radius:8px;padding:16px 18px;margin:0 0 22px;">
      <p style="margin:0 0 10px;font-size:14px;color:#3A4450;line-height:1.7;"><strong>Not ready to decide? Two easy options:</strong></p>
      <p style="margin:0 0 8px;font-size:14px;color:#3A4450;line-height:1.7;">☕ Reply <strong>“coffee”</strong> and come back for a RoboJo on us — no agenda, we’ll walk through the options together.</p>
      <p style="margin:0;font-size:14px;color:#3A4450;line-height:1.7;">📅 Reply <strong>“free week”</strong> and we’ll set you up with a full work week — <strong>Monday through Friday, 8 AM–6 PM</strong>, completely free. Pick any Monday in the next 30 days and the team will confirm and let you in each morning.</p>
    </div>
    ${eventsBlock()}
    <p style="font-size:14px;color:#3A4450;line-height:1.7;margin:22px 0 0;">Questions — or just want another look around? Reply to this email or call <a href="tel:5137945070" style="color:#B08C4A;">513-794-5070</a>. We’d love to have you back.</p>`;
  return shell('A coffee on us — or a free work week if you want more time to decide.',
    'How was your day, <span style="color:#D4BA85;font-style:italic;">' + first + '</span>?', inner);
}

// ── Sheet sync (Apps Script web app). Best-effort; returns parsed JSON. ────
async function postToSheet(body) {
  const URL_HOOK = process.env.SHEETS_WEBHOOK_URL;
  if (!URL_HOOK) { console.log('sheet: SHEETS_WEBHOOK_URL not set, skipping'); return {}; }
  try {
    const res = await fetch(URL_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'follow',
    });
    const text = await res.text().catch(function(){ return ''; });
    console.log('sheet: posted', body.source || body.action, res.status);
    try { return JSON.parse(text); } catch (e) { return {}; }
  } catch (e) {
    console.error('sheet: post failed:', e && e.message);
    return {};
  }
}

/* ─────────────────────── PERFECT VENUE LEAD BRIDGE ───────────────────────
   Re-sends qualifying event-inquiry submissions (event-planner, event-related
   contact, corporate-package, culinary-lab-inquiry) to the same endpoint
   Perfect Venue's own hosted contact form uses, so each lands as a Lead.
   NOT a documented API — failures are logged loudly and the submission is
   still stored by Netlify, so nothing is ever lost. Day-pass, newsletter,
   partner and soft-capture forms are never routed here.
   Env switches (Netlify → Site configuration → Environment variables):
     PV_VENUE_ID (default 8612) · PV_SEND_EMAILS=false (no PV auto-reply)
     PV_DRY_RUN=true (log mapped payload, create nothing) · PV_DISABLED=true */

const PV_ENDPOINT = "https://api.perfectvenue.com/graphql";
const VENUE_ID = process.env.PV_VENUE_ID || "8612";

// Perfect Venue custom-field IDs for Revelance's contact form (in form order).
const PV_FIELD = {
  contactAddress: "e334a543-45c1-498c-b764-0bd4c8968313", // "Contact Address"
  yourAddress: "fa22a363-36e6-4a3f-8c9e-93c2c10ed68f", // "Your Address"
  catering: "a68de1f8-102b-4139-84aa-da093e5fe7a6", // "Are you interested in Catering?"
  alcohol: "090fca78-6fc4-408b-ab4e-d019eeb41748", // "Would you like Alcohol Bar Service?"
};

// Spaces exactly as named in Perfect Venue.
const PV_SPACES = [
  "Revel Room/Sonder",
  "Revel Room",
  "Taproom/Sonder",
  "Taproom",
  "E9 Design Simulator",
  "C-Suite Lounge",
  "Foundation Boardroom",
  "Horizon Boardroom",
  "Overlook Boardroom",
  "Culinary Lab",
];

// PV "Event Type" dropdown values (must match exactly). The wizard's list was
// built from this one; the two extras map to the nearest PV value.
const PV_EVENT_TYPES = ['Anniversary','Birthday','Catering','Corporate','Engagement','Graduation','Happy Hour','Holiday Party','Large Group','Non Profit','Other','Rehearsal Dinner','Shower','Wedding'];
const PV_EVENT_TYPE_MAP = { 'Team Building': 'Corporate', 'Cooking Class': 'Other' };

// Which website forms become Perfect Venue leads.
//   - event-planner: the Plan Your Event wizard (full mapping)
//   - contact: only when the "interest" is event-related
//   - corporate-package, culinary-lab-inquiry: event/package inquiries
// Coworking, day-pass, newsletter, partner and soft-capture forms are skipped
// (those belong in Yardi Kube / email, not Perfect Venue).
const CONTACT_EVENT_INTERESTS = [
  "Event Space Rental",
  "Boardroom Rental",
  "Corporate Account",
];

const MUTATION = `mutation CreateEvent7($input: CreateEventInput!) {
  createEvent(input: $input) {
    event { id __typename }
    errors { message __typename }
    __typename
  }
}`;

// ---------------------------------------------------------------- helpers

const clean = (v) => (v == null ? "" : String(v).trim());

function splitName(full, first, last) {
  if (clean(first) || clean(last)) return [clean(first), clean(last)];
  const parts = clean(full).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

// "18:00", "6:00 PM", "6pm", "6:30pm", "0600" -> minutes after midnight
function toMinutes(v) {
  const s = clean(v).toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap && ap.startsWith("p") && h < 12) h += 12;
  if (ap && ap.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Wizard's time-of-day buttons -> [start, end] minutes
const TIME_PREFS = [
  [/morning/i, [8 * 60, 12 * 60]],
  [/midday/i, [12 * 60, 16 * 60]],
  [/afternoon/i, [14 * 60, 18 * 60]],
  [/evening/i, [18 * 60, 23 * 60]],
  [/full\s*day/i, [8 * 60, 23 * 60]],
];

// "$2,500", "2500", "5k", "$2,000 - $5,000" -> cents (uses the first number)
function toCents(v) {
  const s = clean(v).toLowerCase().replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]) n *= 1000;
  return Math.round(n * 100);
}

function toInt(v) {
  const m = clean(v).replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Accepts ISO "2026-12-31" or anything Date can parse -> "YYYY-MM-DD"
function toISODate(v) {
  const s = clean(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

// Match free text / lists like "Taproom, Revel Room" to PV space names.
function matchSpaces(v) {
  const raw = Array.isArray(v) ? v.join(",") : clean(v);
  if (!raw) return [];
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = [];
  for (const piece of raw.split(/[,;|+]|\band\b/i).map((p) => p.trim()).filter(Boolean)) {
    const p = norm(piece);
    const hit =
      PV_SPACES.find((s) => norm(s) === p) ||
      PV_SPACES.find((s) => p.includes(norm(s))) ||
      PV_SPACES.find((s) => norm(s).includes(p) && p.length >= 4);
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}

function yesNo(v, noPatterns = []) {
  const s = clean(v);
  if (!s) return null;
  if (/^(y|yes|true|1)$/i.test(s)) return "Yes";
  if (/^(n|no|false|0|none)$/i.test(s)) return "No";
  if (noPatterns.some((re) => re.test(s))) return "No";
  return "Yes";
}

function lines(pairs) {
  return pairs
    .filter(([, v]) => clean(Array.isArray(v) ? v.join(", ") : v))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : clean(v)}`)
    .join("\n");
}

// Perfect Venue "Source" dropdown values (must match exactly):
// Website, Email Marketing, Facebook, Instagram, Google, Other, Past Client,
// Phone, Email, Walk-in, Word of Mouth, Referral, OpenTable, Tock, WeddingWire,
// The Knot, Eventective, QR Code, Yelp, PV Marketplace
function pvSource(d) {
  const s = `${clean(d.utm_source)} ${clean(d.lead_source)} ${clean(d.source)}`.toLowerCase();
  if (clean(d.gclid) || /google|gads|adwords|cpc/.test(s)) return "Google";
  if (/facebook|\bfb\b|meta/.test(s)) return "Facebook";
  if (/instagram|\big\b/.test(s)) return "Instagram";
  if (/yelp/.test(s)) return "Yelp";
  if (/qr/.test(s)) return "QR Code";
  if (/email|newsletter|instantly|mailchimp/.test(s)) return "Email Marketing";
  if (/referr?al/.test(s)) return "Referral";
  return "Website";
}

function attribution(d) {
  return lines([
    ["Website form", d["form-name"]],
    ["Page", d.landing_page],
    ["Lead source", d.lead_source || d.source],
    ["UTM campaign", d.utm_campaign],
    ["UTM ad group", d.utm_adgroup],
    ["UTM term", d.utm_term],
    ["GCLID", d.gclid],
  ]);
}

// ---------------------------------------------------------------- mapping

function buildInput(formName, d) {
  const [firstName, lastName] = splitName(d.name, d["first-name"], d["last-name"]);
  const email = clean(d.email);
  if (!email) return { skip: "no email" };

  const vuf = {};
  const set = (k, v) => {
    if (v !== null && v !== undefined && v !== "") vuf[k] = v;
  };
  set("Last Name", lastName);
  set("Phone", clean(d.phone));

  let eventName = "";
  let details = "";
  let spaces = [];

  if (formName === "event-planner") {
    const type = clean(d.eventType) || "Event";
    eventName = `${type} - ${[firstName, lastName].filter(Boolean).join(" ")}`;
    spaces = matchSpaces(d.spaces);

    const startDate = toISODate(d.startDate);
    const endDate = toISODate(d.endDate) || startDate;
    let start = toMinutes(d.startTime);
    let end = toMinutes(d.endTime);
    if (start == null || end == null) {
      const pref = TIME_PREFS.find(([re]) => re.test(clean(d.timePref)));
      if (pref) {
        if (start == null) start = pref[1][0];
        if (end == null) end = pref[1][1];
      }
    }

    const pvType = PV_EVENT_TYPES.indexOf(type) !== -1 ? type : (PV_EVENT_TYPE_MAP[type] || null);
    if (pvType) set("Event Type", pvType);
    const cents = toCents(d.budget);
    if (cents) set("Budget", cents); // skip blank/$0 budgets
    set("Estimated Group Size", toInt(d.guestCount));
    set("Desired Date", startDate);
    set("Desired End Date", endDate);
    set("Start Time", start);
    set("End Time", end);
    // cateringAddress stays in the message (it isn't the guest's address, so
    // it doesn't belong in PV's Contact Address / Your Address fields).
    const cat = yesNo(d.catering, [/no food/i, /handling food ourselves/i]);
    if (cat) vuf[PV_FIELD.catering] = [cat];
    const bar = yesNo(d.alcoholBarService);
    if (bar) vuf[PV_FIELD.alcohol] = [bar];

    details = lines([
      ["Event type", d.eventType],
      ["Guests", d.guestCount],
      ["Spaces requested", d.spaces],
      ["Date", [d.startDate, d.endDate && d.endDate !== d.startDate ? `to ${d.endDate}` : ""].filter(Boolean).join(" ")],
      ["Time", [d.startTime, d.endTime].filter(Boolean).join(" - ") || d.timePref],
      ["Budget", d.budget],
      ["Catering", d.catering],
      ["Caterer / address", d.cateringAddress],
      ["Bar service", [d.alcoholBarService, d.barServiceType].filter(Boolean).join(" - ")],
      ["A/V", d.av],
      ["Linens", d.linen],
      ["Extras", d.extras],
      ["Tour requested", [d.tourRequested, d.tourDate, d.tourTime].filter(Boolean).join(" ")],
      ["Company", d.company],
    ]);
  } else if (formName === "contact") {
    if (!CONTACT_EVENT_INTERESTS.includes(clean(d.interest))) {
      return { skip: `contact interest "${clean(d.interest)}" is not an event inquiry` };
    }
    eventName = `${clean(d.interest)} - ${[firstName, lastName].filter(Boolean).join(" ")}`;
    spaces = clean(d.interest) === "Boardroom Rental" ? ["Foundation Boardroom"] : [];
    details = lines([
      ["Interest", d.interest],
      ["Company", d.company],
      ["Preferred time", d["preferred-time"]],
    ]);
  } else if (formName === "corporate-package") {
    eventName = `Corporate Package - ${clean(d.company) || [firstName, lastName].join(" ")}`;
    const cpCents = toCents(d.budget);
    if (cpCents) set("Budget", cpCents);
    set("Estimated Group Size", toInt(d.teamSize));
    details = lines([
      ["Company", d.company],
      ["Title", d.title],
      ["Team size", d.teamSize],
      ["Frequency", d.frequency],
      ["Priorities", d.priorities],
      ["Budget", d.budget],
    ]);
  } else if (formName === "culinary-lab-inquiry") {
    eventName = `Culinary Lab - ${clean(d.company) || [firstName, lastName].join(" ")}`;
    spaces = ["Culinary Lab"];
    details = lines([
      ["Use case", d["use-case"]],
      ["Company", d.company],
      ["Frequency", d.frequency],
      ["Timeline", d.timeline],
    ]);
  } else {
    return { skip: `form "${formName}" is not routed to Perfect Venue` };
  }

  if (spaces[0]) set("Desired Space", spaces[0]);
  set("Event Name", eventName);

  const guestNote = clean(d.notes || d.message);
  const message = [
    guestNote,
    details && `--- Details from revelanceoh.com ---\n${details}`,
    attribution(d) && `--- Source ---\n${attribution(d)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    input: {
      venueId: VENUE_ID,
      planner: { firstName: firstName || "Website", lastName, email, attemptMatchByEmail: true },
      name: "",
      status: "lead",
      message: message || "Inquiry from revelanceoh.com",
      origin: "contact_form",
      sendEmails: process.env.PV_SEND_EMAILS !== "false",
      messageOrigin: "contact_form",
      venueUserFields: vuf,
      utmSource: pvSource(d), // PV "Source" field
      ...(clean(d.utm_campaign) ? { utmCampaign: clean(d.utm_campaign) } : {}), // PV "Campaign" field
    },
  };
}

async function sendToPerfectVenue(input) {
  const res = await fetch(PV_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      origin: "https://app.perfectvenue.com",
      referer: "https://app.perfectvenue.com/venues/revelance/hello",
    },
    body: JSON.stringify({ operationName: "CreateEvent7", variables: { input }, query: MUTATION }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Perfect Venue HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = json?.data?.createEvent;
  const errs = [...(json.errors || []), ...(payload?.errors || [])];
  if (!res.ok || errs.length || !payload?.event?.id) {
    throw new Error(`Perfect Venue rejected lead (HTTP ${res.status}): ${JSON.stringify(errs).slice(0, 500)}`);
  }
  return payload.event.id;
}

// Never throws — a Perfect Venue failure must not affect anything else.
async function pvBridge(formName, d) {
  try {
    if (process.env.PV_DISABLED === 'true') { console.log('[pv-bridge] disabled; skipped ' + formName); return 'pv disabled'; }
    const built = buildInput(formName, d);
    if (built.skip) { console.log('[pv-bridge] skip ' + formName + ': ' + built.skip); return 'pv skipped'; }
    if (process.env.PV_DRY_RUN === 'true') { console.log('[pv-bridge] DRY RUN', JSON.stringify(built.input)); return 'pv dry run'; }
    const id = await sendToPerfectVenue(built.input);
    console.log('[pv-bridge] ' + formName + ' -> Perfect Venue event ' + id + ' (' + built.input.planner.email + ')');
    return 'pv created ' + id;
  } catch (err) {
    console.error('[pv-bridge] FAILED ' + formName + ': ' + (err && err.message));
    return 'pv failed (logged)';
  }
}

exports.handler = async function (event) {
  try {
    const payload = JSON.parse(event.body || '{}').payload || {};
    const formName = payload.form_name;
    // ── New-member application: branded confirmation (team is BCC'd) ──────
    if (formName === 'new-member') {
      const nd = payload.data || {};
      const NKEY = process.env.RESEND_API_KEY;
      if (NKEY && nd.email) {
        const firstN = (nd.name || 'there').split(' ')[0];
        await sendEmail(NKEY, nd.email,
          'Welcome to Revelance, ' + firstN + ' — your membership form is in',
          newMemberEmail(nd.name, nd.membership || '', prettyVisit(nd['start-date'] || '')));
      }
      return { statusCode: 200, body: 'ok (new member)' };
    }

    if (formName !== 'free-day-pass' && formName !== 'check-in' && formName !== 'pick-a-day') {
      // Event-inquiry forms route to Perfect Venue; pvBridge skips the rest.
      const pv = await pvBridge(formName, payload.data || {});
      return { statusCode: 200, body: 'ok (' + pv + ')' };
    }
    const d = payload.data || {};
    const KEY = process.env.RESEND_API_KEY;

    // ── Front-desk check-in: complete the row, cancel pending sends, follow up
    if (formName === 'check-in') {
      // Guests here to meet someone: log with host, concierge email + day-3
      // work-week offer. No walk-in pitch, no membership follow-up.
      if (String(d['visitor-type'] || '') === 'Guest') {
        await postToSheet({
          timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
          source: 'Guest Check-In',
          name: d.name || '', email: d.email || '', phone: d.phone || '',
          company: d.company || '', meetingWith: d['meeting-with'] || '',
        });
        if (KEY && d.email) {
          const gFirst = (d.name || 'there').split(' ')[0];
          await sendEmail(KEY, d.email, 'Welcome to Revelance, ' + gFirst,
            guestWelcomeEmail(d.name));
          await sendEmail(KEY, d.email, 'A work week at Revelance — on us',
            guestFollowUpEmail(d.name), nineAmBusinessDay(3));
        }
        return { statusCode: 200, body: 'ok (guest)' };
      }
      const resp = await postToSheet({
        timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
        source: 'Check-In (QR)',
        name: d.name || '', email: d.email || '', phone: d.phone || '',
        company: d.company || '', mailingAddress: d['mailing-address'] || '',
        passCode: d['pass-code'] || '',
        membershipInterest: d['membership-interest'] || '',
      });
      if (KEY && resp && Array.isArray(resp.dripIds) && resp.dripIds.length) {
        await cancelEmails(KEY, resp.dripIds);
      }
      if (KEY && d.email) {
        const first = (d.name || 'there').split(' ')[0];
        // Walk-ins (no pass code) never got a welcome email — send one now.
        if (!String(d['pass-code'] || '').trim()) {
          await sendEmail(KEY, d.email, 'Welcome to Revelance, ' + first + ' — you’re checked in',
            walkInEmail(d.name));
        }
        await sendEmail(KEY, d.email, 'How was your day at Revelance, ' + first + '?',
          followUpEmail(d.name, d['membership-interest'] || ''), nineAmBusinessDay(1));
      }
      return { statusCode: 200, body: 'ok' };
    }

    // ── Pick-a-day: set or change the visit date ──────────────────────────
    if (formName === 'pick-a-day') {
      const visit = d['visit-date'] || '';
      const vs = visitStatus(visit);
      if (!vs) return { statusCode: 200, body: 'ok (no usable date)' };
      const resp = await postToSheet({
        action: 'reschedule',
        source: 'Pick-A-Day',
        email: d.email || '', passCode: d['pass-code'] || '',
        visitDate: usVisit(visit),
        notes: 'Plans to visit ' + usVisit(visit) + ' (picked ' + usVisit(todayEastern()) + ')',
      });
      if (KEY && resp && Array.isArray(resp.dripIds) && resp.dripIds.length) {
        await cancelEmails(KEY, resp.dripIds);
      }
      if (KEY && d.email) {
        const name = d.name || (resp && resp.name) || '';
        const code = d['pass-code'] || (resp && resp.passCode) || '';
        const first = (name || 'there').split(' ')[0];
        const expPretty = prettyVisit(isoFromUs(resp && resp.expires));
        const newDrips = [];
        if (vs === 'today') {
          // Visiting today: the morning email doubles as the confirmation.
          await sendEmail(KEY, d.email, 'See you today at Revelance, ' + first,
            morningEmail(name, code, d.email));
        } else {
          // 'far' dates get the confirmation but no scheduled reminder
          // (beyond Resend's ~30-day window).
          const canRemind = (vs === 'future');
          await sendEmail(KEY, d.email, first + ', you’re booked for ' + prettyVisit(visit),
            rescheduleConfirmEmail(name, code, d.email, prettyVisit(visit), expPretty, canRemind));
          if (canRemind) {
            const id = await sendEmail(KEY, d.email, 'See you today at Revelance, ' + first,
              morningEmail(name, code, d.email), morningOfEastern(visit));
            if (id) newDrips.push(id);
          }
        }
        if (newDrips.length) {
          await postToSheet({ action: 'store-drips', email: d.email || '', passCode: code, dripIds: newDrips.join(',') });
        }
      }
      return { statusCode: 200, body: 'ok' };
    }

    // ── Free day pass signup ──────────────────────────────────────────────
    if (formName === 'free-day-pass') {
      const visit0 = d['visit-date'] || '';
      const base30 = addDaysEastern(30);
      // A planned visit past day 30 extends the expiration from the start.
      const expires = (visitStatus(visit0) && visit0 > base30) ? visit0 : base30;
      const expPretty = prettyVisit(expires);
      const visit = d['visit-date'] || '';
      const vs = visitStatus(visit);
      const vPretty = (vs === 'future' || vs === 'far') ? prettyVisit(visit) : '';
      const drips = [];

      if (KEY) {
        if (d.email && d['pass-code']) {
          await sendEmail(KEY, d.email, (d.name || 'Your').split(' ')[0] + ', your Revelance day pass is confirmed',
            passEmail(d.name, d['pass-code'], false, null, vPretty, expPretty, d.email, vs === 'future'));
        }
        if (d['colleague-email'] && d['colleague-pass-code']) {
          await sendEmail(KEY, d['colleague-email'], (d['colleague-name'] || 'Your').split(' ')[0] + ', your Revelance day pass is ready',
            passEmail(d['colleague-name'], d['colleague-pass-code'], true, d.name, vPretty, expPretty, d['colleague-email'], vs === 'future'));
        }
        if (vs === 'future') {
          // Morning-of reminders on the chosen day (7:30 AM ET).
          const when = morningOfEastern(visit);
          if (d.email && d['pass-code']) {
            const id = await sendEmail(KEY, d.email, 'See you today at Revelance, ' + (d.name || 'there').split(' ')[0],
              morningEmail(d.name, d['pass-code'], d.email), when);
            if (id) drips.push(id);
          }
          if (d['colleague-email'] && d['colleague-pass-code']) {
            const id = await sendEmail(KEY, d['colleague-email'], 'See you today at Revelance, ' + (d['colleague-name'] || 'there').split(' ')[0],
              morningEmail(d['colleague-name'], d['colleague-pass-code'], d['colleague-email']), when);
            if (id) drips.push(id);
          }
        } else if (!vs && d.email && d['pass-code']) {
          // No date picked: 3-email drip at 9 AM ET on days 7, 16, and 27.
          const first = (d.name || 'there').split(' ')[0];
          const plan = [
            [7,  1, first + ', your day at Revelance is waiting'],
            [16, 2, 'Still saving you a seat, ' + first],
            [27, 3, first + ', your day pass expires ' + prettyVisit(expires).split(',')[0]],
          ];
          for (const [days, stage, subject] of plan) {
            const id = await sendEmail(KEY, d.email, subject,
              tickleEmail(d.name, d['pass-code'], d.email, stage, expPretty),
              nineAmBusinessDay(days));
            if (id) drips.push(id);
          }
        }
      }

      await postToSheet({
        timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
        source: 'Website Signup',
        name: d.name || '', email: d.email || '', phone: d.phone || '',
        company: d.company || '', mailingAddress: d['mailing-address'] || '',
        passCode: d['pass-code'] || '',
        colleagueName: d['colleague-name'] || '', colleagueEmail: d['colleague-email'] || '',
        colleaguePassCode: d['colleague-pass-code'] || '',
        leadSource: d.lead_source || '', utmCampaign: d.utm_campaign || '',
        notes: (vs ? 'Plans to visit ' + usVisit(visit) + '.' : ''),
        expires: usVisit(expires),
        dripIds: drips.join(','),
      });
      return { statusCode: 200, body: 'ok' };
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('submission-created error:', e && e.message);
    return { statusCode: 200, body: 'ok (error logged)' };
  }
};
