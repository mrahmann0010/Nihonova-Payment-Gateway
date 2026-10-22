import { MESSAGES } from "../contract/spec.generated";

export type MessageId = keyof typeof MESSAGES;

/**
 * A message from spec.json with its `{name}` slots filled. Every SDK formats
 * from the same templates, so an outcome's `reason` reads the same in any
 * language.
 */
export function message(id: MessageId, vars: Record<string, unknown> = {}): string {
  return MESSAGES[id].replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in vars ? String(vars[name]) : slot,
  );
}

/**
 * JSON.stringify, except that a missing value reads "undefined" — for
 * messages that show what the caller or the gateway sent.
 */
export function shown(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
