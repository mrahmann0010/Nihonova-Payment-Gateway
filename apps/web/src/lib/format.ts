// Client-side formatting helpers — ported from the backend's views/helpers.js
// so the SvelteKit UI renders amounts, dates and relative times identically.

// Amount → "1,234.56" (or "—" when missing).
export function fmtAmount(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Count → "1,234".
export function fmtCount(n: number | null | undefined): string {
  return (n || 0).toLocaleString();
}

// Whole-taka amount → "৳ 1,234".
export function taka(n: number | null | undefined): string {
  return '৳ ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ISO date → "29 Jun 2026, 02:15 PM" in Bangladesh local time.
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
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

// Platform → display label ("bkash" → "bKash").
export function platformLabel(name: string): string {
  if (name === 'bkash') return 'bKash';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Brand colors per platform (matches the old dashboard).
export const COLORS: Record<string, string> = {
  bkash: '#E2136E',
  nagad: '#F6921E',
  rocket: '#8A2BE2'
};
export const ACCENT = '#4F7BFF';
export const PLATFORMS = ['bkash', 'nagad', 'rocket'] as const;
