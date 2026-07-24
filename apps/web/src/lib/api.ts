// Typed client for the smsServer admin API.
// Auth is a server-set httpOnly JWT cookie (see stores/auth): the browser
// attaches it automatically on every credentialed request, so no token is
// handled in JS. `credentials: 'include'` is required for the cross-origin
// cookie to be sent.

import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE = PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers ?? {}) }
  });
  if (res.status === 401) throw new ApiError(401, 'Not authenticated');
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

// ---- Response shapes (mirrors src/routes/admin.js) ----
export interface PlatformTotals { count: number; amount: number }
export interface Stats {
  totals: { count: number; amount: number; byPlatform: Record<string, PlatformTotals> };
  daily: { labels: string[]; series: Record<string, number[]> };
  revenue: { labels: string[]; series: Record<string, number[]>; total: number[] };
  periods: Record<string, PlatformTotals>;
  peakHours: { labels: number[]; counts: number[] };
}

export interface Payment {
  platform: string;
  trxId: string;
  amount: number;
  sender: string;
  fee: number;
  balance: number;
  ref: string | null;
  dateReceived: string;
  timeReceived?: string;
  rawDate?: string;
  simNumber?: number | null;
}
export interface PaymentsPage {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Freshness { name: string; lastReceivedAt: string | null; hoursSince: number | null }
export interface EventCounts { unmatched: number; duplicate: number; unknown_sender: number; error: number }
export interface WebhookEvent {
  reason: string;
  platform: string | null;
  sender: string | null;
  rawMessage: string | null;
  error: string | null;
  createdAt: string;
}
export interface Health {
  freshness: Freshness[];
  counts24h: EventCounts;
  counts7d: EventCounts;
  recentEvents: WebhookEvent[];
}

export interface TopSender { sender: string; count: number; amount: number }
export interface Customers { total: number; returning: number; new: number; returningPct: number }
export interface Report {
  from: string;
  to: string;
  totals: { count: number; amount: number; fee: number; byPlatform: Record<string, PlatformTotals & { fee: number }> };
  daily: { labels: string[]; series: Record<string, number[]> };
  topSenders: TopSender[];
  customers: Customers;
}

export interface Session { username: string }

export const api = {
  // ---- Auth (cookie session) ----
  login: (username: string, password: string) =>
    request<Session>('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),
  logout: () => request<void>('/admin/auth/logout', { method: 'POST' }),
  me: () => request<Session>('/admin/auth/me'),

  // ---- Data ----
  stats: () => request<Stats>('/admin/api/stats'),
  health: () => request<Health>('/admin/api/health'),
  payments: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<PaymentsPage>(`/admin/api/payments?${qs}`);
  },
  reports: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Report>(`/admin/api/reports?${qs.toString()}`);
  }
};
