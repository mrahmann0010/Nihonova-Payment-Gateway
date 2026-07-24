// Auth store (Svelte 5 runes). The session is an httpOnly JWT cookie set by the
// server — JS never sees the token. `authed` flips as soon as login/verify
// succeeds; all dashboard data is loaded reactively by TanStack Query (see
// $lib/query and the per-page `createQuery` calls), enabled off `authed` and
// refetched in the background so new records surface without a manual reload.

import { api, ApiError } from '$lib/api';

class Auth {
  username = $state('');
  authed = $state(false);
  checking = $state(false);
  ready = $state(false); // true once the initial session probe has finished
  error = $state('');

  // Restore an existing session on app load — one cheap /me call. Runs before
  // the login screen is shown so a returning user never re-enters credentials.
  async init() {
    try {
      const { username } = await api.me();
      this.username = username;
      this.authed = true;
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
    this.error = '';
  }
}

export const auth = new Auth();
