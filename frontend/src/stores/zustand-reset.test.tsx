// Copyright 2026 Redpanda Data, Inc.

import { describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import type { create as RealCreate, createStore as RealCreateStore, StateCreator } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';

import { create, createStore, storeResetFns } from '../../__mocks__/zustand';

// Assignability proves both public generic overload sets, not just the concrete runtime examples below.
const checkedCreate: typeof RealCreate = create;
const checkedCreateStore: typeof RealCreateStore = createStore;

type Counter = { count: number; increment: () => void; ephemeral?: string };
const counterCreator: StateCreator<Counter> = (set) => ({
  count: 1,
  increment: () => set((state) => ({ count: state.count + 1 })),
});
const automaticStore = checkedCreateStore(() => ({ count: 1 }));

function resetRegisteredStores() {
  act(() => {
    for (const reset of storeResetFns) {
      reset();
    }
  });
}

describe('zustand automatic-reset wrapper', () => {
  test.each([
    { name: 'React uncurried', make: () => checkedCreate(counterCreator) },
    { name: 'React curried', make: () => checkedCreate<Counter>()(counterCreator) },
    { name: 'vanilla uncurried', make: () => checkedCreateStore(counterCreator) },
    { name: 'vanilla curried', make: () => checkedCreateStore<Counter>()(counterCreator) },
  ])('registers and restores the initial snapshot: $name', ({ make }) => {
    const previousResetCount = storeResetFns.size;
    const store = make();
    const initial = store.getInitialState();
    store.setState({ count: 9, ephemeral: 'remove on reset' });
    resetRegisteredStores();
    expect(storeResetFns.size).toBe(previousResetCount + 1);
    expect(store.getState()).toBe(initial);
    expect(Object.hasOwn(store.getState(), 'ephemeral')).toBe(false);
    store.getState().increment();
    expect(store.getState().count).toBe(2);
  });

  // Two cycles exercise the mock's installed afterEach hook, without manually invoking it here.
  test.each(['first cycle', 'second cycle'])('automatically resets between tests: %s', () => {
    expect(automaticStore.getState().count).toBe(1);
    automaticStore.setState({ count: 8 });
  });

  test('resets the React hook inside act so mounted selectors observe the initial state', () => {
    const store = checkedCreate(counterCreator);
    const { result } = renderHook(() => store((state) => state.count));
    act(() => store.getState().increment());
    expect(result.current).toBe(2);
    resetRegisteredStores();
    expect(result.current).toBe(1);
  });

  test('retains composed middleware APIs and resets to getInitialState rather than hydrated state', () => {
    localStorage.setItem('zustand-reset-contract', JSON.stringify({ state: { count: 8 }, version: 0 }));
    const store = checkedCreateStore<Counter>()(
      devtools(
        persist(subscribeWithSelector(counterCreator), {
          name: 'zustand-reset-contract',
          storage: createJSONStorage(() => localStorage),
        }),
        { enabled: false }
      )
    );
    const listener = rs.fn<(count: number, previous: number) => void>();
    const unsubscribe = store.subscribe((state) => state.count, listener);
    expect([store.getState().count, store.getInitialState().count, store.persist.getOptions().name]).toStrictEqual([
      8,
      1,
      'zustand-reset-contract',
    ]);
    store.setState({ count: 9 }, false, 'counter/change');
    resetRegisteredStores();
    expect(store.getState().count).toBe(1);
    expect(listener).toHaveBeenLastCalledWith(1, 9);
    unsubscribe();
  });
});
