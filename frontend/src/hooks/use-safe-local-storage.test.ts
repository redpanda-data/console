import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocalStorageFlag, setLocalStorageFlag } from './use-safe-local-storage';

describe('getLocalStorageFlag', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    // Ensure window exists for the typeof check
    if (typeof globalThis.window === 'undefined') {
      // @ts-expect-error - Mocking window in node environment
      globalThis.window = {};
    }
  });

  afterEach(() => {
    // Restore original state
    if (originalWindow === undefined) {
      // @ts-expect-error - Restoring window state
      delete globalThis.window;
    }
    // @ts-expect-error - Restoring localStorage
    globalThis.localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  it('returns true when localStorage value is "true"', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn().mockReturnValue('true'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(getLocalStorageFlag('test-flag')).toBe(true);
  });

  it('returns false when localStorage value is "false"', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn().mockReturnValue('false'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(getLocalStorageFlag('test-flag')).toBe(false);
  });

  it('returns false when localStorage value is not set', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(getLocalStorageFlag('nonexistent-flag')).toBe(false);
  });

  it('returns false when localStorage value is any other string', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn().mockReturnValue('yes'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(getLocalStorageFlag('test-flag')).toBe(false);
  });

  it('returns false when window is undefined (SSR)', () => {
    // @ts-expect-error - Simulating SSR
    delete globalThis.window;
    expect(getLocalStorageFlag('test-flag')).toBe(false);
  });

  it('returns false when localStorage throws', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn().mockImplementation(() => {
        throw new Error('Storage access denied');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(getLocalStorageFlag('test-flag')).toBe(false);
  });
});

describe('setLocalStorageFlag', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  let setItemMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Ensure window exists for the typeof check
    if (typeof globalThis.window === 'undefined') {
      // @ts-expect-error - Mocking window in node environment
      globalThis.window = {};
    }
    setItemMock = vi.fn();
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      getItem: vi.fn(),
      setItem: setItemMock,
      removeItem: vi.fn(),
    };
  });

  afterEach(() => {
    // Restore original state
    if (originalWindow === undefined) {
      // @ts-expect-error - Restoring window state
      delete globalThis.window;
    }
    // @ts-expect-error - Restoring localStorage
    globalThis.localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  it('sets localStorage value to "true" when value is true', () => {
    setLocalStorageFlag('test-flag', true);
    expect(setItemMock).toHaveBeenCalledWith('test-flag', 'true');
  });

  it('sets localStorage value to "false" when value is false', () => {
    setLocalStorageFlag('test-flag', false);
    expect(setItemMock).toHaveBeenCalledWith('test-flag', 'false');
  });

  it('does nothing when window is undefined (SSR)', () => {
    // @ts-expect-error - Simulating SSR
    delete globalThis.window;
    setLocalStorageFlag('test-flag', true);
    // Should not throw and setItem should not be called (window check happens first)
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('silently fails when localStorage throws', () => {
    // @ts-expect-error - Mocking localStorage
    globalThis.localStorage = {
      setItem: vi.fn().mockImplementation(() => {
        throw new Error('QuotaExceededError');
      }),
    };
    // Should not throw
    expect(() => setLocalStorageFlag('test-flag', true)).not.toThrow();
  });
});
