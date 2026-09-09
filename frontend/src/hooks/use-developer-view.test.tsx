import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import useDeveloperView from './use-developer-view';

describe('useDeveloperView', () => {
  const store: Record<string, string> = {};
  const localStorageMock = {
    getItem: rs.fn((key: string) => store[key] ?? null),
    setItem: rs.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: rs.fn((key: string) => {
      delete store[key];
    }),
    clear: rs.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: rs.fn((index: number) => Object.keys(store)[index] ?? null),
  };

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    rs.clearAllMocks();
  });

  afterEach(() => {
    rs.restoreAllMocks();
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

  it('toggles on ? and persists the choice', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useDeveloperView());

    expect(result.current).toBe(false);

    // Pressing '?' previously caused React error #301 in production when connected to
    // vanilla Kafka (issue #2262). userEvent.keyboard wraps the state update in act().
    await user.keyboard('?');

    expect(result.current).toBe(true);
    expect(store.dv).toBe(JSON.stringify(true));

    await user.keyboard('?');

    expect(result.current).toBe(false);
    expect(store.dv).toBe(JSON.stringify(false));
  });

  it('returns false when localStorage contains invalid JSON', () => {
    store.dv = 'not-json';
    const { result } = renderHook(() => useDeveloperView());
    expect(result.current).toBe(false);
  });
});
