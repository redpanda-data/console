// Copyright 2026 Redpanda Data, Inc.

/**
 * Testing Zustand Stores
 *
 * To enable automatic Zustand store resets between tests, add this line at the top
 * of your test file (after imports):
 *
 * ```typescript
 * import { rs } from '@rstest/core';
 *
 * rs.mock('zustand');
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
 * Note: Tests without `rs.mock('zustand')` will use the real Zustand implementation.
 */

import { afterEach, rs } from '@rstest/core';
import { act } from '@testing-library/react';
import type * as ZustandExportedTypes from 'zustand';

export type {
  ExtractState,
  Mutate,
  StateCreator,
  StoreApi,
  StoreMutatorIdentifier,
  StoreMutators,
  UseBoundStore,
} from 'zustand';
// Re-export everything from zustand
// biome-ignore lint/performance/noBarrelFile: Mock file needs to re-export all Zustand exports
export { useStore } from 'zustand';

const { create: actualCreate, createStore: actualCreateStore } =
  rs.requireActual<typeof ZustandExportedTypes>('zustand');

// A variable to hold reset functions for all stores declared in the app
export const storeResetFns = new Set<() => void>();

function createUncurried<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
): ZustandExportedTypes.UseBoundStore<ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos>> {
  let initializedApi: ZustandExportedTypes.StoreApi<T> | undefined;
  const captureApi: ZustandExportedTypes.StateCreator<T, [], Mos> = (set, get, api) => {
    initializedApi = api;
    return stateCreator(set, get, api);
  };
  const store = actualCreate(captureApi);
  if (initializedApi === undefined) {
    throw new Error('Zustand initializer did not run');
  }
  const baselineApi = initializedApi;
  // Read only after create returns: the initial snapshot is not available during the initializer itself.
  const initialState = baselineApi.getInitialState();
  storeResetFns.add(() => baselineApi.setState(initialState, true));
  return store;
}

export function create<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
): ZustandExportedTypes.UseBoundStore<ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos>>;
export function create<T>(): <Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
) => ZustandExportedTypes.UseBoundStore<ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos>>;
export function create<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator?: ZustandExportedTypes.StateCreator<T, [], Mos>
) {
  if (stateCreator !== undefined) {
    return createUncurried(stateCreator);
  }
  return <Mutators extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
    initializer: ZustandExportedTypes.StateCreator<T, [], Mutators>
  ) => createUncurried(initializer);
}

function createStoreUncurried<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
): ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos> {
  let initializedApi: ZustandExportedTypes.StoreApi<T> | undefined;
  const captureApi: ZustandExportedTypes.StateCreator<T, [], Mos> = (set, get, api) => {
    initializedApi = api;
    return stateCreator(set, get, api);
  };
  const store = actualCreateStore(captureApi);
  if (initializedApi === undefined) {
    throw new Error('Zustand initializer did not run');
  }
  const baselineApi = initializedApi;
  const initialState = baselineApi.getInitialState();
  storeResetFns.add(() => baselineApi.setState(initialState, true));
  return store;
}

export function createStore<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
): ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos>;
export function createStore<T>(): <Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator: ZustandExportedTypes.StateCreator<T, [], Mos>
) => ZustandExportedTypes.Mutate<ZustandExportedTypes.StoreApi<T>, Mos>;
export function createStore<T, Mos extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
  stateCreator?: ZustandExportedTypes.StateCreator<T, [], Mos>
) {
  if (stateCreator !== undefined) {
    return createStoreUncurried(stateCreator);
  }
  return <Mutators extends [ZustandExportedTypes.StoreMutatorIdentifier, unknown][] = []>(
    initializer: ZustandExportedTypes.StateCreator<T, [], Mutators>
  ) => createStoreUncurried(initializer);
}

// Reset all stores after each test run
afterEach(() => {
  act(() => {
    for (const resetFn of storeResetFns) {
      resetFn();
    }
  });
});
