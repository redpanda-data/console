/** An object whose string-keyed values are unknown. Includes arrays, not just JSON dictionaries. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Unlike Array.isArray's any[] result, retain unknown at unvalidated input boundaries. */
export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Preserve presence checks at indexed/optional boundaries without relying on object truthiness. */
export function isPresent<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/** Extract a table/filter string without pretending an unknown value is already parsed. */
export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Accept only arrays whose every item is a string; retain the original validated array. */
export function stringArrayValue(value: unknown): string[] | undefined {
  return isUnknownArray(value) && value.every((item): item is string => typeof item === 'string') ? value : undefined;
}
