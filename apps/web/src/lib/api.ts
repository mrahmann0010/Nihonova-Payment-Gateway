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

// Sent on every write. The server refuses a state-changing request without it
// (middleware/csrfGuard.js) — a custom header can't be set by a cross-site
// form, and it forces a preflight the origin allowlist then rejects.
const REQUESTED_WITH = 'nihonova-admin';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers ?? {}) }
  });
  if (res.status === 401) throw new ApiError(401, 'Not authenticated');
  if (!res.ok) {
    // Validation failures carry a message meant for the admin ("That client ID
    // is already taken") — surface it instead of a bare status code.
    const message = await res
      .json()
      .then((b) => (b && typeof b.error === 'string' ? b.error : null))
      .catch(() => null);
    throw new ApiError(res.status, message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

// Write helper — JSON body plus the two headers every mutation needs.
function write<T>(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': REQUESTED_WITH },
    body: JSON.stringify(body ?? {})
  });
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
  // Only computed for the first page (no cursor); null on later pages.
  total: number | null;
  limit: number;
  // Pass back as `cursor` to get the next page; null on the last page.
  nextCursor: string | null;
}

// Payments in a window with no live claim against them (mirrors
// computeUnclaimed() in src/routes/admin.js). A window report rather than a
// paged list — there is no index that can page the absence of a row, so the
// date window is what keeps the query bounded.
export interface UnclaimedSummary {
  days: number;
  since: string;
  // Everything received in the window, claimed or not — the denominator.
  received: number;
  count: number;
  amount: number;
  byPlatform: Record<string, PlatformTotals>;
}
export interface Unclaimed {
  payments: Payment[];
  // True when the window holds more unclaimed payments than the server returns.
  truncated: boolean;
  summary: UnclaimedSummary;
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

// A registered consuming app (mirrors serialize() in src/routes/clients.js).
// No secret field exists anywhere in this shape — the server never sends one.
export interface Client {
  clientId: string;
  name: string;
  active: boolean;

  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  notes: string;

  maxClaimAmount: number | null;
  claimWindowDays: number | null;
  // When on, a claim must carry the payer's phone and it must match the
  // payment's sender.
  requireSenderMatch: boolean;

  secretSetAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
  // Non-null only while a rotation's grace window is still open, i.e. while
  // the previous secret also still authenticates.
  previousExpiresAt: string | null;

  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// Business + policy fields. Everything optional: a PATCH sends only what changed.
export interface ClientInput {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  notes?: string;
  maxClaimAmount?: number | null;
  claimWindowDays?: number | null;
  requireSenderMatch?: boolean;
  active?: boolean;
}

// One row of the redemption ledger (mirrors serialize() in src/routes/claims.js).
// `amount` is what actually arrived; `expectedAmount` is what the business asked
// for. They differ only upward — underpayment is refused at claim time.
export interface Claim {
  id: string;
  trxId: string;
  platform: 'bkash' | 'nagad' | 'rocket';
  amount: number;
  sender: string;

  expectedAmount: number;
  overpaidBy: number;

  clientId: string;
  orderRef: string;
  idempotencyKey: string;

  state: 'claimed' | 'released';
  claimedAt: string;
  releasedAt: string | null;
  releaseReason: string;
  releasedBy: string;
}

export interface ClaimsPage {
  claims: Claim[];
  // Keyset cursor; null on the last page. Never an offset — see routes/claims.js.
  nextCursor: string | null;
}

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
  unclaimed: (days: number, platform = 'all') =>
    request<Unclaimed>(`/admin/api/unclaimed?days=${days}&platform=${platform}`),
  reports: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Report>(`/admin/api/reports?${qs.toString()}`);
  },

  // ---- Clients (registered consuming apps) ----
  clients: () => request<{ clients: Client[] }>('/admin/api/clients'),

  createClient: (body: ClientInput & { clientId: string; name: string; secret: string }) =>
    write<{ client: Client }>('/admin/api/clients', 'POST', body),

  updateClient: (clientId: string, body: ClientInput) =>
    write<{ client: Client }>(`/admin/api/clients/${clientId}`, 'PATCH', body),

  rotateClientSecret: (clientId: string, secret: string, graceHours: number) =>
    write<{ client: Client }>(`/admin/api/clients/${clientId}/rotate`, 'POST', {
      secret,
      graceHours
    }),

  revokeClientPrevious: (clientId: string) =>
    write<{ client: Client }>(`/admin/api/clients/${clientId}/revoke-previous`, 'POST'),

  // ---- Claims (the redemption ledger) ----
  claims: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== '' && v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return request<ClaimsPage>(`/admin/api/claims?${qs}`);
  },

  // Hands the payment back so it can be claimed again. Admin-only, and the
  // reason is required — an unexplained release is indistinguishable from an
  // attempt to let a payment be spent twice.
  releaseClaim: (id: string, reason: string) =>
    write<{ claim: Claim }>(`/admin/api/claims/${id}/release`, 'POST', { reason })
};
