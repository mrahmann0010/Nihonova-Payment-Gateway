// Typed client for the smsServer admin API.
// The admin token is held in memory (see stores/auth) and attached as the
// `x-admin-token` header on every request — never persisted to localStorage.

import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE = PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'x-admin-token': token, ...(init.headers ?? {}) }
  });
  if (res.status === 401) throw new ApiError(401, 'Invalid or expired token');
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.json() as Promise<T>;
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
export interface Report {
  from: string;
  to: string;
  totals: { count: number; amount: number; fee: number; byPlatform: Record<string, PlatformTotals & { fee: number }> };
  daily: { labels: string[]; series: Record<string, number[]> };
  topSenders: TopSender[];
}

export const api = {
  stats: (token: string) => request<Stats>('/admin/api/stats', token),
  health: (token: string) => request<Health>('/admin/api/health', token),
  payments: (token: string, params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<PaymentsPage>(`/admin/api/payments?${qs}`, token);
  },
  reports: (token: string, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Report>(`/admin/api/reports?${qs.toString()}`, token);
  }
};
