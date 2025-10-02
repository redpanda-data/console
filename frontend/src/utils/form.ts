/**
 * Type-safe helper to extract object keys as a tuple for Zod enums
 * Preserves the literal string types from keyof T
 */
export function enumFromKeys<T extends Record<string, unknown>>(obj: T): [keyof T, ...(keyof T)[]] {
  const keys = Object.keys(obj);
  return keys as [keyof T, ...(keyof T)[]];
}
