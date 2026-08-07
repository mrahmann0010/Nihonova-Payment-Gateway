// Client-side formatting helpers — ported from the backend's views/helpers.js
// so the SvelteKit UI renders amounts, dates and relative times identically.
// Everything here lands in a `.mono` slot: identifiers, phone numbers,
// timestamps, counts and taka amounts all have to align in columns.

// Amount → "1,234.56" (or "—" when missing).
export function fmtAmount(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Count → "1,234".
export function fmtCount(n: number | null | undefined): string {
  return (n || 0).toLocaleString();
}

// Amount → "৳3,500.00". The canonical way to render money in the UI.
export function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return '৳' + fmtAmount(n);
}

// Whole-taka amount → "৳284,500". For axis ticks and roll-up totals.
export function taka(n: number | null | undefined): string {
  return '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Bangladesh-time parts, with an uppercase meridiem to match the design.
function bd(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso)
    .toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', ...opts })
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

// ISO date → "07 Aug 2026, 02:41 PM" in Bangladesh local time.
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return bd(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// ISO date → "02:41 PM" in Bangladesh local time.
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return bd(iso, { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ISO date → coarse relative time ("Just now", "5 minutes ago", "2 hours ago").
export function fmtAgo(iso: string | null | undefined): string {
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

// ISO date → compact age for table cells ("5m", "3h", "2d").
export function fmtAgeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const mins = Math.round(secs / 60);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h';
  return Math.round(hrs / 24) + 'd';
}

// Platform → display label ("bkash" → "bKash").
export function platformLabel(name: string): string {
  if (name === 'bkash') return 'bKash';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Fixed platform brand colors — these are never re-mapped by the theme.
export const COLORS: Record<string, string> = {
  bkash: '#E2136E',
  nagad: '#F6921E',
  rocket: '#8A2BE2'
};
export const ACCENT = '#3B5BDB';
export const PLATFORMS = ['bkash', 'nagad', 'rocket'] as const;
