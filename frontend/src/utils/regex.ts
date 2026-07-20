export const ALPHANUMERIC_WITH_HYPHENS = new RegExp(/[^A-Z0-9_]/g);

/** Escape a string for literal use inside a `RegExp`, so its metacharacters match themselves. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
