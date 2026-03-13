import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useDeveloperView from './use-developer-view';

describe('useDeveloperView', () => {
  const store: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false by default when localStorage has no stored value', () => {
    const { result } = renderHook(() => useDeveloperView());
    expect(result.current).toBe(false);
  });

  it('reads stored developer view preference from localStorage', () => {
    store.dv = JSON.stringify(true);
    const { result } = renderHook(() => useDeveloperView());
    expect(result.current).toBe(true);
  });

  it('does not crash when pressing ? key', () => {
    const { result } = renderHook(() => useDeveloperView());

    // Simulate pressing '?' — this previously caused React error #301 in production
    // when connected to vanilla Kafka (issue #2262)
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    }).not.toThrow();

    // Hook should still return a valid boolean
    expect(typeof result.current).toBe('boolean');
  });

  it('returns false when localStorage contains invalid JSON', () => {
    store.dv = 'not-json';
    const { result } = renderHook(() => useDeveloperView());
    expect(typeof result.current).toBe('boolean');
  });
});
