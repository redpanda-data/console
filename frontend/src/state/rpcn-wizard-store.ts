/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useCallback } from 'react';
import { createFlatStorage } from 'utils/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  MinimalTopicData,
  MinimalUserData,
  OnboardingWizardFormData,
} from '../components/pages/rp-connect/types/wizard';

export const CONNECT_WIZARD_CONNECTOR_KEY = 'connect-wizard-connections';

type RpcnWizardData = Partial<OnboardingWizardFormData> &
  Partial<MinimalTopicData> &
  Partial<MinimalUserData> & { yamlContent: string | undefined };

type RpcnWizardStore = RpcnWizardData & {
  hasHydrated: boolean;
  setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
  setTopicData: (data: Partial<MinimalTopicData>) => void;
  setUserData: (data: Partial<MinimalUserData>) => void;
  setYamlContent: (data: { yamlContent: string | undefined }) => void;
  setHasHydrated: (state: boolean) => void;
  reset: () => void;
};

const initialData: RpcnWizardData = { yamlContent: undefined };

/**
 * Persists only the input/output connection choices; topic, account and YAML choices are transient.
 */
export const useRpcnWizardStore = create<RpcnWizardStore>()(
  persist(
    (set, get) => ({
      ...initialData,
      hasHydrated: false,
      setWizardData: (data) => set(data),
      setTopicData: (data) => set(data),
      setUserData: (data) => set(data),
      setYamlContent: (data) => set(data),
      setHasHydrated: (state) => set({ hasHydrated: state }),
      reset: () => {
        sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
        return set(
          {
            ...initialData,
            hasHydrated: false,
            setWizardData: get().setWizardData,
            setTopicData: get().setTopicData,
            setUserData: get().setUserData,
            setYamlContent: get().setYamlContent,
            setHasHydrated: get().setHasHydrated,
            reset: get().reset,
          },
          true
        );
      },
    }),
    {
      name: CONNECT_WIZARD_CONNECTOR_KEY,
      storage: createFlatStorage<Pick<OnboardingWizardFormData, 'input' | 'output'>>(),
      partialize: (state) => ({
        input: state.input,
        output: state.output,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export const useResetRpcnWizardStore = () => useCallback(() => useRpcnWizardStore.getState().reset(), []);

function rpcnWizardData(state: RpcnWizardStore) {
  const {
    setWizardData: _setWizardData,
    setTopicData: _setTopicData,
    setUserData: _setUserData,
    setYamlContent: _setYamlContent,
    setHasHydrated: _setHasHydrated,
    reset: _reset,
    hasHydrated: _hasHydrated,
    ...data
  } = state;
  return data satisfies RpcnWizardData;
}

/**
 * Read connection data, falling back to session storage for the race where the
 * store hydrated before CloudV2 wrote it (client-side nav, no full reload).
 */
export function getWizardConnectionData() {
  const { input, output } = useRpcnWizardStore.getState();
  if (input || output) {
    return { input, output };
  }

  let connectionData: Pick<OnboardingWizardFormData, 'input' | 'output'> = { input, output };
  try {
    const stored = readStoredConnectionData();
    if (stored) {
      connectionData = { input: stored.input, output: stored.output };
      useRpcnWizardStore.getState().setWizardData(connectionData);
    }
  } catch {}

  return connectionData;
}

function readStoredConnectionData() {
  const raw = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
  return raw ? (JSON.parse(raw) as Partial<Pick<OnboardingWizardFormData, 'input' | 'output'>>) : null;
}

const getWizardData: () => Partial<OnboardingWizardFormData> = () => rpcnWizardData(useRpcnWizardStore.getState());
const getTopicData: () => Partial<MinimalTopicData> = () => rpcnWizardData(useRpcnWizardStore.getState());
const getUserData: () => Partial<MinimalUserData> = () => rpcnWizardData(useRpcnWizardStore.getState());

/** Imperative API for non-hook contexts (class components, utility functions). */
export const rpcnWizardStore = {
  getWizardData,
  getTopicData,
  getUserData,
  hasHydrated: () => useRpcnWizardStore.getState().hasHydrated,
  setWizardData: (data: Partial<OnboardingWizardFormData>) => useRpcnWizardStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useRpcnWizardStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useRpcnWizardStore.getState().setUserData(data),
  setYamlContent: (data: { yamlContent: string | undefined }) => useRpcnWizardStore.getState().setYamlContent(data),
  reset: () => useRpcnWizardStore.getState().reset(),
};
