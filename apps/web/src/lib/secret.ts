// Client-secret rules, mirrored from the server's services/clientSecret.js.
//
// This is the convenience copy: it lets the form say what's wrong while the
// admin types instead of after a round trip. The server re-checks everything
// and is the only thing that actually decides — keep the two in step.

export const MIN_LENGTH = 32;
export const MAX_LENGTH = 200;
export const MIN_DISTINCT = 16;
export const MIN_CLASSES = 3;

const CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

export function countClasses(secret: string): number {
  return CLASSES.filter((re) => re.test(secret)).length;
}

// Returns the message to show, or null when the secret passes.
export function validateSecret(secret: string, clientId = ''): string | null {
  if (!secret) return 'Secret is required';
  if (/\s/.test(secret)) return 'Secret cannot contain spaces or line breaks';
  if (secret.length < MIN_LENGTH) return `Secret must be at least ${MIN_LENGTH} characters`;
  if (secret.length > MAX_LENGTH) return `Secret must be at most ${MAX_LENGTH} characters`;
  if (new Set(secret).size < MIN_DISTINCT)
    return `Secret must use at least ${MIN_DISTINCT} different characters`;
  if (countClasses(secret) < MIN_CLASSES)
    return 'Secret must mix at least three of: lowercase, uppercase, digits, symbols';
  if (clientId && secret.toLowerCase().includes(clientId.toLowerCase()))
    return 'Secret must not contain the client ID';
  return null;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Generate a strong secret **in the browser**, never on the server.
//
// This is the point of the whole design: the plaintext exists only in this tab
// and in whatever the admin pastes it into. No response body ever carries a
// secret, so there is no server code path that could leak one, and "shown
// once" is a fact about the system rather than a promise from the UI.
export function generateSecret(length = 44): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    const out = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    // Astronomically unlikely to fail at this length, but a generated secret
    // the server would reject is not a thing worth shipping.
    if (!validateSecret(out)) return out;
  }
  throw new Error('Could not generate a secret');
}

// 0–4, for the strength meter. Everything below 4 is also an error message —
// the bar exists to show progress while typing, not to grade a passing secret.
export function strengthScore(secret: string): number {
  if (!secret) return 0;
  let score = 0;
  if (secret.length >= MIN_LENGTH) score++;
  if (secret.length >= 44) score++;
  if (new Set(secret).size >= MIN_DISTINCT) score++;
  if (countClasses(secret) >= MIN_CLASSES) score++;
  return score;
}
