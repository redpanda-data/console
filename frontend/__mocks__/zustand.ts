/**
 * Testing Zustand Stores
 *
 * To enable automatic Zustand store resets between tests, add this line at the top
 * of your test file (after imports):
 *
 * ```typescript
 * import { vi } from 'vitest';
 *
 * vi.mock('zustand');
 *
 * describe('My Test', () => {
 *   // Store resets happen automatically in afterEach from the mock
 *   // Manage sessionStorage manually in your beforeEach/afterEach hooks
 * });
 * ```
 *
 * This enables the mock in `__mocks__/zustand.ts` which tracks all store instances
 * and resets them to their initial state after each test.
 *
 * Note: Tests without `vi.mock('zustand')` will use the real Zustand implementation.
 */

import { act } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type * as ZustandExportedTypes from 'zustand';

// Re-export everything from zustand
// biome-ignore lint/performance/noBarrelFile: Mock file needs to re-export all Zustand exports
export * from 'zustand';

const { create: actualCreate, createStore: actualCreateStore } =
  await vi.importActual<typeof ZustandExportedTypes>('zustand');

// A variable to hold reset functions for all stores declared in the app
export const storeResetFns = new Set<() => void>();

const createUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreate(stateCreator);
  const initialState = store.getInitialState();
  storeResetFns.add(() => {
    store.setState(initialState, true);
  });
  return store;
};

// When creating a store, we get its initial state, create a reset function and add it in the set
export const create = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  // To support curried version of create
  return typeof stateCreator === 'function' ? createUncurried(stateCreator) : createUncurried;
}) as typeof ZustandExportedTypes.create;

const createStoreUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreateStore(stateCreator);
  const initialState = store.getInitialState();
  storeResetFns.add(() => {
    store.setState(initialState, true);
  });
  return store;
};

// When creating a store, we get its initial state, create a reset function and add it in the set
export const createStore = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  // To support curried version of createStore
  return typeof stateCreator === 'function' ? createStoreUncurried(stateCreator) : createStoreUncurried;
}) as typeof ZustandExportedTypes.createStore;

// Reset all stores after each test run
afterEach(() => {
  act(() => {
    for (const resetFn of storeResetFns) {
      resetFn();
    }
  });
});
