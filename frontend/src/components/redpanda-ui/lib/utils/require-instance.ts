/** Validate runtime boundaries instead of asserting an unknown value's class. */
export function requireInstance<T>(
  value: unknown,
  expectedClass: abstract new (...args: never[]) => T,
  message: string
): T {
  if (!(value instanceof expectedClass)) {
    throw new TypeError(message);
  }
  return value;
}
