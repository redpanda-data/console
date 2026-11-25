export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function safeStringify(value: unknown): string {
  try {
    // The replacer overload claims string, but unsupported top-level values still return undefined.
    const serialized: unknown = JSON.stringify(
      value,
      (_key: string, currentValue: unknown) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }
        if (currentValue instanceof Date) {
          return currentValue.toISOString();
        }
        return currentValue;
      },
      2
    );
    return typeof serialized === 'string' ? serialized : 'undefined';
  } catch {
    return '/* serialization error */';
  }
}
