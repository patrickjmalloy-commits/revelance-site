// Netlify Edge Function: event-og.js
// Serves rich social share previews for Revelance events.
// Image URLs are hardcoded from AddEvent/Eventbrite — no dynamic fetch needed.

const EVENTS = {
  'ev-event-planner-luncheon': {
    title: 'Event Planner Luncheon — Come See What\'s Possible',
    date: 'Wednesday, September 30, 2026',
    time: '12:00 – 2:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'A private luncheon for event planners. Tour the spaces, meet the team, lunch on us — plus limited-time booking discounts exclusive to attendees. RSVP free.',
    shareUrl: 'https://www.eventbrite.com/e/event-planner-luncheon-tickets-1998813310418?aff=oddtdtcreator',
    image: 'https://revelanceoh.com/images/og-event-planner-luncheon.jpg',
  },
  'ev-murder-mystery-cluedunnit': {
    title: 'Clue’dunnit?! — An Interactive Murder Mystery',
    date: 'Friday, October 9, 2026',
    time: '7:00 PM – 9:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Everyone’s a suspect. An interactive murder mystery cocktail evening — $45 ticket includes the mystery, hot appetizers, trivia, and prizes, with Sonder Brewing behind the cash bar.',
    shareUrl: 'https://events.humanitix.com/cluedunnit-an-interactive-murder-mystery-mason',
    image: 'https://revelanceoh.com/images/og-murder-mystery-cluedunnit.jpg',
  },
  'ev-brews-boos-happy-hour': {
    title: 'Brews & Boos Happy Hour',
    date: 'Tuesday, October 20, 2026',
    time: '4:00 PM – 6:00 PM',
    location: 'The Taproom at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Happy hour with a Halloween spirit — members and invited open-house guests mingle over a drink in the Taproom. RSVP free.',
    shareUrl: 'https://www.eventbrite.com/e/brews-boos-happy-hour-tickets-1998498187878?aff=oddtdtcreator',
    image: 'https://revelanceoh.com/images/og-brews-boos-happy-hour.jpg',
  },
  'ev-taco-tuesday-on-a-wednesday': {
    title: 'Taco Tuesday But On A Wednesday',
    date: 'Wednesday, November 4, 2026',
    time: '11:00 AM – 1:00 PM',
    location: 'The Taproom at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Tacos, drinks, and good conversation in the Taproom — a casual midday break for Revelance members and invited guests. RSVP free.',
    shareUrl: 'https://www.eventbrite.com/e/2000509308193?aff=oddtdtcreator',
    image: 'https://revelanceoh.com/images/og-taco-tuesday-wednesday.jpg',
  },
  'ev-jingle-mingle-happy-hour': {
    title: 'Jingle & Mingle Happy Hour',
    date: 'Wednesday, December 2, 2026',
    time: '4:00 PM – 6:00 PM',
    location: 'The Taproom at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: '’Tis the season to take a break and mingle — a festive Taproom happy hour with Revelance members and invited guests. RSVP free.',
    shareUrl: 'https://www.eventbrite.com/e/2000518904897?aff=oddtdtcreator',
    image: 'https://revelanceoh.com/images/og-jingle-mingle-happy-hour.jpg',
  },
  'ev-hops-holly-holiday-market': {
    title: 'Hops & Holly Holiday Market',
    date: 'Saturday, December 12, 2026',
    time: '10:00 AM – 3:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Sonder Brewing and Revelance team up for holiday cheer — local vendors, delicious drinks, and festive fun. Open to the public.',
    shareUrl: 'https://revelanceoh.com/events/#ev-hops-holly-holiday-market',
    image: 'https://revelanceoh.com/images/og-hops-holly-holiday-market.jpg',
  },
  'ev-nothin-but-networking': {
    title: 'Nothin But Networking',
    date: 'Thursday, March 19, 2026',
    time: '12:00 – 8:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: '2nd Annual March Madness networking event. Connect with local professionals while enjoying basketball, food, drinks, games, and prizes.',
    shareUrl: 'https://www.eventbrite.com/e/nothin-but-networking-tickets-1981944277687?aff=oddtdtcreator',
    image: 'https://revelanceoh.com/events/images/nothin-but-networking-2026.png',
  },
  'ev-next-gen-card-traders': {
    title: 'Next Gen Card Traders \u2014 Kids Card Trading Night',
    date: 'Monday, April 20, 2026',
    time: '6:00 \u2013 9:00 PM',
    location: 'Revelance \u00b7 8460 Duke Blvd, Mason OH 45040',
    desc: 'Free kids sports card and Pok\u00e9mon trading night. Open floor, safe and supervised. No admission, no cost to attend. Taphouse open for parents.',
    shareUrl: 'https://next-gen-card-traders.eventbrite.com/',
    image: 'https://revelanceoh.com/images/og-next-gen-card-traders.jpg',
  },
  'ev-greater-stakes-kentucky-derby-casino-soir-e': {
    title: 'Greater Stakes: Kentucky Derby Casino Soirée',
    date: 'Saturday, May 2, 2026',
    time: '4:00 – 7:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'A Derby-themed evening of casino games, live jazz, cocktails, and southern elegance — benefiting children in need through Greater Project. 21+ event.',
    shareUrl: 'https://www.greaterproject.org/',
    image: 'https://revelanceoh.com/events/images/greater-stakes-kentucky-derby-2026.png',
  },
  'ev-zinkubator-burger-bar-live': {
    title: 'ZinkUbator: Burger Bar Live',
    date: 'Friday, March 20, 2026',
    time: '11:30 AM – 1:30 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Witness a full burger bar concept executed live on commercial equipment. Taste the finished product and see real-world ROI in action.',
    shareUrl: 'https://evt.to/0l5bl9qr396c',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/Bh7m5JgW.jpg',
  },
  'ev-zinkubator-pizza-palooza': {
    title: 'ZinkUbator: Pizza-Palooza',
    date: 'Friday, May 1, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Watch a live pizza concept come to life on commercial deck ovens — from dough to finished pie, in front of you.',
    shareUrl: 'https://evt.to/x1hj86qmbczh',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/ch2QVr6e.jpg',
  },
  'ev-zinkubator-freaky-fryday-s': {
    title: "ZinkUbator: Freaky FryDay's",
    date: 'Friday, May 22, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Everything fried. Nothing held back. A live deep-fry concept featuring a full menu built around commercial frying equipment.',
    shareUrl: 'https://evt.to/dgxk2yhxd92t',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/WXGumywa.png',
  },
  'ev-zinkubator-the-artisan-sandwich-co': {
    title: 'ZinkUbator: The Artisan Sandwich Co.',
    date: 'Friday, June 19, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Monthly pop-up restaurant featuring an artisan sandwich concept. Watch real menus prepared on commercial sandwich and pressing equipment.',
    shareUrl: 'https://evt.to/5wbvyndpsrpq',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/LqsaSVxU.png',
  },
  'ev-zinkubator-holy-smoke': {
    title: 'ZinkUbator: Holy Smoke',
    date: 'Friday, July 17, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Monthly pop-up restaurant featuring a BBQ and smoked meats concept. Watch real menus prepared on commercial smokers and grills.',
    shareUrl: 'https://evt.to/hltqvfh2fzlx',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/EjcNsnvv.jpg',
  },
  'ev-member-summer-cookout': {
    title: 'Member Summer Cookout — Luau Grill Out',
    date: 'Wednesday, June 17, 2026',
    time: '12:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Members Only Luau Grill Out — grilled favorites, tropical music, and summer vibes at the Taproom and outdoor space.',
    shareUrl: 'https://revelanceoh.com/events/#ev-member-summer-cookout',
    image: 'https://revelanceoh.com/images/og-member-summer-cookout.jpg',
  },
  'ev-made-chamber-happy-hour-250': {
    title: 'MADE Chamber Happy Hour — Celebrate 250 Years at Revelance!',
    date: 'Wednesday, June 24, 2026',
    time: '4:00 PM – 6:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Summer grill out, outdoor games, and relaxed networking with professionals and community leaders — celebrating 250 years of America.',
    shareUrl: 'https://business.madechamber.org/events/details/connections-made-happy-hour-25773?calendarMonth=2026-06-01',
    image: 'https://revelanceoh.com/images/og-made-chamber-happy-hour-250.jpg',
  },
  'ev-fortegic-taxes-retirement-jul-14': {
    title: 'Fortegic: Taxes in Retirement Seminar',
    date: 'Tuesday, July 14, 2026',
    time: '6:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Taxes in Retirement seminar hosted by Fortegic at Revelance. Starts 6:00 PM — open to the public, registration required.',
    shareUrl: 'https://event.rsvpyes.com/Rsvp/LandingPage/503244/1?preview=False',
    image: 'https://revelanceoh.com/images/og-fortegic-taxes-retirement.jpg',
  },
  'ev-fortegic-taxes-retirement-jul-15': {
    title: 'Fortegic: Taxes in Retirement Seminar',
    date: 'Wednesday, July 15, 2026',
    time: '6:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Taxes in Retirement seminar hosted by Fortegic at Revelance. Starts 6:00 PM — open to the public, registration required.',
    shareUrl: 'https://event.rsvpyes.com/Rsvp/LandingPage/503244/1?preview=False',
    image: 'https://revelanceoh.com/images/og-fortegic-taxes-retirement.jpg',
  },
  'ev-member-movie-night-sandlot': {
    title: 'Member Movie Night — The Sandlot',
    date: 'Friday, July 17, 2026',
    time: '7:00 PM',
    location: 'Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Outdoor movie night behind the building — The Sandlot under the summer sky. Members only.',
    shareUrl: 'https://revelanceoh.com/events/#ev-member-movie-night-sandlot',
    image: 'https://revelanceoh.com/images/og-member-movie-night-sandlot.jpg',
  },

  'ev-zinkubator-fin-fork': {
    title: 'ZinkUbator: Fin & Fork',
    date: 'Friday, August 21, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Watch a live seafood concept plated and served on commercial cooking equipment — evaluate heat control, precision, and throughput.',
    shareUrl: 'https://evt.to/6mfpsw608cds',
    image: 'https://revelanceoh.com/images/culinary-lab-event.jpg',
  },
  'ev-zinkubator-pub-days': {
    title: 'ZinkUbator: Pub Days',
    date: 'Friday, September 18, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Burgers, wings, and bar food executed live on commercial flat tops, fryers, and holding equipment.',
    shareUrl: 'https://evt.to/rks7pwyql64c',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/Fihdrx6f.jpg',
  },
  'ev-zinkubator-octoberfest': {
    title: 'ZinkUbator: Octoberfest',
    date: 'Friday, October 16, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'A German Oktoberfest concept brought to life in the Culinary Lab: sausages, schnitzel, braised cabbage, and potato salad.',
    shareUrl: 'https://evt.to/xls6dll7vr2p',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/RT4zBSS8.png',
  },
  'ev-zinkubator-asian-bistro': {
    title: 'ZinkUbator: Asian Bistro',
    date: 'Friday, November 20, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'Asian cuisine demands precision — wok heat, steam timing, consistent sauce work at volume. Watch it live.',
    shareUrl: 'https://evt.to/3fcfgg6qz13x',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/8FaQf9p9.png',
  },
  'ev-zinkubator-le-petit-pop-up': {
    title: 'ZinkUbator: Le Petit Pop Up',
    date: 'Friday, December 18, 2026',
    time: '11:00 AM – 2:00 PM',
    location: 'Culinary Lab at Revelance · 8460 Duke Blvd, Mason OH 45040',
    desc: 'A refined small-plates French concept executed live on commercial cooking equipment — elegant technique, exacting temperature control.',
    shareUrl: 'https://evt.to/rb3vfh7xcr4n',
    image: 'https://upcdn.io/FW25b1i/image/uploads/acgLzAHDOzULtkHcxmUR333159/ogpjkrgQ.png',
  },
};

export default async (request, context) => {
  const url = new URL(request.url);
  const shareId = url.searchParams.get('share');

  if (!shareId) return context.next();

  const ev = EVENTS[shareId];
  if (!ev) return context.next();

  // Serve OG tags to everyone — crawlers read them, real visitors get JS-redirected.
  // No user-agent detection needed — works for Facebook, LinkedIn, iMessage,
  // WhatsApp, Telegram, Signal, and any future platform automatically.
  const canonicalUrl = `https://revelanceoh.com/events/?share=${shareId}`;
  const fullTitle = `${ev.title} | ${ev.date}`;
  const fullDesc = `${ev.time} · ${ev.location} · ${ev.desc}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${fullTitle}</title>
<meta name="description" content="${fullDesc}">
<meta name="robots" content="noindex">
<meta property="og:type" content="event">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${fullDesc}">
<meta property="og:image" content="${ev.image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="Revelance">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${fullTitle}">
<meta name="twitter:description" content="${fullDesc}">
<meta name="twitter:image" content="${ev.image}">
</head>
<body>
<script>window.location.replace("${ev.shareUrl}");</script>
<p>Redirecting...</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
