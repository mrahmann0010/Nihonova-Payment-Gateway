// helpers.js — server-side formatting helpers shared by the EJS views.
//
// Moving formatting to the server (where EJS auto-escapes with <%= %>) is the
// whole point of the htmx migration: partials come back as ready-to-render HTML,
// so the client no longer hand-builds rows or hand-escapes user data.

// Amount → "1,234.56" (or "—" when missing).
function fmtAmount(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Whole-taka amount → "৳ 1,234".
function taka(n) {
  return '৳ ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ISO date → "29 Jun 2026, 02:15 PM" in Bangladesh local time.
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ISO date → coarse relative time ("Just now", "5 minutes ago", "2 hours ago").
function fmtAgo(iso) {
  if (!iso) return '—';
  let diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) diff = 0;
  if (diff < 45) return 'Just now';
  if (diff < 90) return 'A minute ago';
  const mins = Math.round(diff / 60);
  if (mins < 60) return mins + ' minutes ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

module.exports = { fmtAmount, taka, fmtDateTime, fmtAgo };
