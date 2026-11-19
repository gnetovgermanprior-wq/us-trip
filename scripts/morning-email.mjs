// Sends the morning summary for the current trip day.
// Runs from GitHub Actions (see .github/workflows/morning-email.yml).
// Secrets: FIREBASE_SERVICE_ACCOUNT (JSON), GMAIL_USER, GMAIL_APP_PASSWORD.
// TEST=1 sends only to GMAIL_USER. DAY=YYYY-MM-DD overrides the date (for testing).
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

const SITE = process.env.SITE_URL || 'https://gnetovgermanprior-wq.github.io/us-trip/';
const TEST = process.env.TEST === '1' || process.env.TEST === 'true';

const FL = 'Orlando, Florida', NY = 'New York City';
const DAYS = {
  '2026-12-24': {city: 'Vienna → Orlando', hol: 'Christmas Eve', fixed: [['20:45', 'Flight VIE → MCO lands in Orlando']]},
  '2026-12-25': {city: FL, hol: 'Christmas Day'},
  '2026-12-26': {city: FL},
  '2026-12-27': {city: FL},
  '2026-12-28': {city: FL, hol: 'Last full day in Florida'},
  '2026-12-29': {city: 'Orlando → New York', fixed: [['12:32', 'Flight MCO → NYC, lands 15:14']]},
  '2026-12-30': {city: NY},
  '2026-12-31': {city: NY, hol: 'New Year’s Eve'},
  '2027-01-01': {city: NY, hol: 'New Year’s Day'},
  '2027-01-02': {city: NY},
  '2027-01-03': {city: NY, hol: 'Last day · flight home 23:30', fixed: [['23:30', 'Flight NYC → VIE (be at the airport by 21:30)']]},
};

// Today's date in trip time (Orlando and New York are both US Eastern).
const today = process.env.DAY || new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(new Date());
let day = DAYS[today];
if (!day && TEST) { console.log(`${today} is not a trip day; test mode uses 2026-12-30.`); }
const key = day ? today : (TEST ? '2026-12-30' : null);
if (!key) { console.log(`${today} is not a trip day. Nothing to send.`); process.exit(0); }
day = DAYS[key];

admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db = admin.firestore();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const toMin = t => /^\d{1,2}:\d{2}$/.test(t || '') ? (+t.split(':')[0]) * 60 + (+t.split(':')[1]) : 9999;
const costOf = it => {
  if (typeof it.cost === 'number' && isFinite(it.cost)) return it.cost;
  const p = String(it.price || ''); if (/free/i.test(p)) return 0;
  const m = p.replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? +m[0] : null;
};
const money = n => n === 0 ? 'Free' : '$' + (+n).toLocaleString('en-US', n % 1 ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0});
const longDate = k => new Date(k + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'});

// ---- data ----
const items = (await db.collection('items').where('day', '==', key).get()).docs.map(d => d.data())
  .filter(i => i.status === 'approved');
const prevKey = Object.keys(DAYS)[Object.keys(DAYS).indexOf(key) - 1];
const photosYesterday = prevKey ? (await db.collection('photos').where('day', '==', prevKey).count().get()).data().count : 0;

const rows = [
  ...(day.fixed || []).map(([time, title]) => ({time, title, flight: true})),
  ...items.map(i => ({time: i.time || '', end: i.end || '', title: i.title, url: safeUrl(i.url), note: i.note, cat: i.cat, cost: costOf(i)})),
].sort((a, b) => toMin(a.time) - toMin(b.time));
const total = rows.reduce((a, r) => a + (r.cost || 0), 0);

// ---- recipients: members + admin, minus anyone who switched the email off ----
const profiles = (await db.collection('profiles').get()).docs.map(d => d.data());
const optedOut = new Set(profiles.filter(p => p.morningEmail === false && p.email).map(p => p.email.toLowerCase()));
const emails = new Set([
  ...(await db.collection('members').get()).docs.map(d => d.id.toLowerCase()),
  ...profiles.filter(p => p.email).map(p => p.email.toLowerCase()),
]);
let to = [...emails].filter(e => !optedOut.has(e) && e.includes('@'));
if (TEST) to = [process.env.GMAIL_USER];
if (!to.length) { console.log('No recipients.'); process.exit(0); }

// ---- email ----
const row = r => `
  <tr>
    <td style="padding:12px 14px 12px 0;vertical-align:top;font:600 14px/1.4 Georgia,serif;color:#a3313f;white-space:nowrap;width:86px">${esc(r.time || 'Any time')}${r.end ? `<br><span style="font:12px Arial,sans-serif;color:#8a7f72">to ${esc(r.end)}</span>` : ''}</td>
    <td style="padding:12px 0;vertical-align:top;border-bottom:1px solid #eadfcd">
      <div style="font:600 15px/1.35 Arial,sans-serif;color:#1d1b2a">${r.flight ? '✈︎ ' : r.cat === 'gastro' ? '🍽 ' : ''}${r.url ? `<a href="${esc(r.url)}" style="color:#1d1b2a">${esc(r.title)}</a>` : esc(r.title)}</div>
      ${r.note ? `<div style="font:13px/1.45 Arial,sans-serif;color:#6b6257;margin-top:3px">${esc(r.note)}</div>` : ''}
      ${r.cost != null ? `<div style="font:12px Arial,sans-serif;color:#8a7f72;margin-top:4px">${money(r.cost)}${r.cost ? ' per person' : ''}</div>` : ''}
    </td>
  </tr>`;

const html = `<!doctype html><html><body style="margin:0;background:#f4ecdf;padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fffaf2;border-radius:14px;overflow:hidden;border:1px solid #eadfcd">
  <tr><td style="background:#141a35;padding:26px 24px;color:#f4ecdf">
    <div style="font:700 11px Arial,sans-serif;letter-spacing:.2em;color:#d6b25e;text-transform:uppercase">Good morning · ${esc(day.city)}</div>
    <div style="font:400 28px/1.2 Georgia,serif;margin-top:8px">${esc(longDate(key))}</div>
    ${day.hol ? `<div style="font:14px Arial,sans-serif;color:#c9c2b6;margin-top:6px">${esc(day.hol)}</div>` : ''}
  </td></tr>
  <tr><td style="padding:8px 24px 4px">
    ${rows.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.map(row).join('')}</table>`
      : `<p style="font:15px/1.5 Arial,sans-serif;color:#4a4339;margin:18px 0">Nothing is planned yet. A free day! Ideas are on the site.</p>`}
  </td></tr>
  <tr><td style="padding:12px 24px 22px;font:14px/1.5 Arial,sans-serif;color:#4a4339">
    ${total ? `<div>Today costs about <b>${money(total)}</b> per person.</div>` : ''}
    ${photosYesterday ? `<div style="margin-top:4px">${photosYesterday} new photo${photosYesterday === 1 ? '' : 's'} from yesterday on the photo wall.</div>` : ''}
    <a href="${SITE}" style="display:inline-block;margin-top:16px;background:#a3313f;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px">Open the trip planner</a>
  </td></tr>
  <tr><td style="padding:14px 24px;background:#f4ecdf;font:12px/1.5 Arial,sans-serif;color:#8a7f72">You get this every trip morning at 8:00. To stop it, open the site, tap your name at the top and switch off “Morning email”.</td></tr>
</table></body></html>`;

const text = [`Good morning! ${longDate(key)} · ${day.city}`, '',
  ...(rows.length ? rows.map(r => `${r.time || 'Any time'}  ${r.title}${r.cost ? ` (${money(r.cost)} pp)` : ''}${r.url ? `\n        ${r.url}` : ''}`) : ['Nothing planned yet.']),
  '', total ? `About ${money(total)} per person today.` : '', SITE].join('\n');

const tx = nodemailer.createTransport({service: 'gmail', auth: {user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD}});
await tx.sendMail({
  from: {name: 'Orlando & New York', address: process.env.GMAIL_USER},
  to: process.env.GMAIL_USER,
  bcc: TEST ? undefined : to,
  subject: `${TEST ? '[Test] ' : ''}Today: ${longDate(key)}${rows.length ? ` · ${rows.length} plan${rows.length === 1 ? '' : 's'}` : ''}`,
  text, html,
});
console.log(`Sent to ${to.length} recipient(s).`);
process.exit(0);
