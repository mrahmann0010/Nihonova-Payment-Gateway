// In-memory auth store (Svelte 5 runes). The admin token lives only for the
// session in memory; on reload the user re-enters it at the login screen.
// This avoids persisting a bearer-equivalent secret to localStorage.

import { api, ApiError, type Stats } from '$lib/api';
import { alerts } from '$lib/stores/alerts.svelte';

class Auth {
  token = $state('');
  authed = $state(false);
  checking = $state(false);
  error = $state('');
  stats = $state<Stats | null>(null);

  async login(token: string) {
    this.checking = true;
    this.error = '';
    try {
      // Verify the token by fetching stats — doubles as the initial data load.
      const stats = await api.stats(token);
      this.token = token;
      this.stats = stats;
      this.authed = true;
      alerts.load(token, stats);
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : 'Login failed';
      this.authed = false;
    } finally {
      this.checking = false;
    }
  }

  logout() {
    this.token = '';
    this.authed = false;
    this.stats = null;
    this.error = '';
  }

  async refresh() {
    if (!this.token) return;
    try {
      this.stats = await api.stats(this.token);
      alerts.load(this.token, this.stats);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.logout();
    }
  }
}

export const auth = new Auth();
