/** Validate an invariant before using an indexed or externally supplied value. */
export function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
