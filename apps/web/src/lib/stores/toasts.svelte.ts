// Transient confirmations, bottom-left, auto-dismissed after 4s.
// Anything that needs the user to act belongs in an AlertBanner instead.

export type ToastTone = 'ok' | 'info' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  action?: { label: string; run: () => void };
}

const DISMISS_MS = 4000;

class Toasts {
  items = $state<Toast[]>([]);
  #nextId = 1;

  push(tone: ToastTone, text: string, action?: Toast['action']) {
    const id = this.#nextId++;
    this.items = [...this.items, { id, tone, text, action }];
    setTimeout(() => this.dismiss(id), DISMISS_MS);
  }

  ok(text: string, action?: Toast['action']) {
    this.push('ok', text, action);
  }
  info(text: string, action?: Toast['action']) {
    this.push('info', text, action);
  }
  error(text: string, action?: Toast['action']) {
    this.push('error', text, action);
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
