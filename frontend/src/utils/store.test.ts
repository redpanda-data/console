import { z } from 'zod';

import { createFlatStorage } from './store';
import { describe, expect, test } from 'bun:test';

const decode = (value: unknown) => z.object({ count: z.number() }).parse(value);

describe('flat session persistence', () => {
  test('decodes existing flat data and supplies the Zustand envelope', () => {
    sessionStorage.setItem('flat-contract', '{"count":0}');
    expect(createFlatStorage(decode).getItem('flat-contract')).toStrictEqual({ state: { count: 0 }, version: 0 });
  });

  test('does not pretend a malformed stored value has the caller generic type', () => {
    sessionStorage.setItem('flat-contract', '{"count":"bad"}');
    expect(() => createFlatStorage(decode).getItem('flat-contract')).toThrow();
  });

  test('keeps writes flat and supports missing and removed keys', () => {
    const storage = createFlatStorage(decode);
    expect(storage.getItem('flat-contract')).toBeNull();
    storage.setItem('flat-contract', { state: { count: 2 }, version: 0 });
    expect(sessionStorage.getItem('flat-contract')).toBe('{"count":2}');
    storage.removeItem('flat-contract');
    expect(storage.getItem('flat-contract')).toBeNull();
  });
});
