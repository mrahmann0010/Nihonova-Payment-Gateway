/**
 * Trim with exactly the whitespace set in spec.json. That set *is*
 * String.prototype.trim's, so this is the native call; it exists so every
 * trim in the SDK is one the other SDKs reproduce (they trim spec.whitespace,
 * not their own language's idea of whitespace).
 */
export function trim(value: string): string {
  return value.trim();
}
