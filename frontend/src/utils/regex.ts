export const ALPHANUMERIC_WITH_HYPHENS = /[^A-Z0-9_]/gu;

/** Escape a string for literal use inside a `RegExp`, so its metacharacters match themselves. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
