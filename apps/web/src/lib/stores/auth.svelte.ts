// Auth store (Svelte 5 runes). The session is an httpOnly JWT cookie set by the
// server — JS never sees the token. `authed` flips as soon as login/verify
// succeeds; dashboard data (stats) loads in the background so the UI appears
// instantly instead of blocking on the heavy /stats call.

import { api, ApiError, type Stats } from '$lib/api';
import { alerts } from '$lib/stores/alerts.svelte';

class Auth {
  username = $state('');
  authed = $state(false);
  checking = $state(false);
  ready = $state(false); // true once the initial session probe has finished
  error = $state('');
  stats = $state<Stats | null>(null);

  // Restore an existing session on app load — one cheap /me call. Runs before
  // the login screen is shown so a returning user never re-enters credentials.
  async init() {
    try {
      const { username } = await api.me();
      this.username = username;
      this.authed = true;
      this.refresh(); // fire-and-forget; charts fill in shortly after
    } catch {
      this.authed = false;
    } finally {
      this.ready = true;
    }
  }

  async login(username: string, password: string) {
    this.checking = true;
    this.error = '';
    try {
      const session = await api.login(username, password);
      this.username = session.username;
      this.authed = true;
      this.refresh(); // background load — don't block sign-in on /stats
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : 'Login failed';
      this.authed = false;
    } finally {
      this.checking = false;
    }
  }

  async logout() {
    try {
      await api.logout();
    } catch {
      /* clearing the cookie is best-effort */
    }
    this.username = '';
    this.authed = false;
    this.stats = null;
    this.error = '';
  }

  async refresh() {
    try {
      this.stats = await api.stats();
      alerts.load(this.stats);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.logout();
    }
  }
}

export const auth = new Auth();
