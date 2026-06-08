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

// Single store for the RPCN (Redpanda Connect) creation wizard, grouping the
// connection / topic / user / yaml slices that were once separate stores.
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
        // replace: true clears all data while preserving the action methods.
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
      // Only input/output connections persist; topic/user/yaml are transient.
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

// Strip store metadata, leaving only the data fields.
function rpcnWizardData(state: RpcnWizardStore): RpcnWizardData {
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
  return data;
}

/**
 * Read connection data, falling back to session storage for the race where the
 * store hydrated before CloudV2 wrote it (client-side nav, no full reload).
 */
export function getWizardConnectionData(): Pick<OnboardingWizardFormData, 'input' | 'output'> {
  let input = useRpcnWizardStore.getState().input;
  let output = useRpcnWizardStore.getState().output;

  if (!(input || output)) {
    try {
      const raw = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Pick<OnboardingWizardFormData, 'input' | 'output'>>;
        input = parsed.input;
        output = parsed.output;
        // Sync the store so other consumers see the data
        useRpcnWizardStore.getState().setWizardData({ input, output });
      }
    } catch {
      // Ignore malformed session storage
    }
  }

  return { input, output };
}

/** Imperative API for non-hook contexts (class components, utility functions). */
export const rpcnWizardStore = {
  getWizardData: (): Partial<OnboardingWizardFormData> => rpcnWizardData(useRpcnWizardStore.getState()),
  getTopicData: (): Partial<MinimalTopicData> => rpcnWizardData(useRpcnWizardStore.getState()),
  getUserData: (): Partial<MinimalUserData> => rpcnWizardData(useRpcnWizardStore.getState()),
  hasHydrated: () => useRpcnWizardStore.getState().hasHydrated,
  setWizardData: (data: Partial<OnboardingWizardFormData>) => useRpcnWizardStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useRpcnWizardStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useRpcnWizardStore.getState().setUserData(data),
  setYamlContent: (data: { yamlContent: string | undefined }) => useRpcnWizardStore.getState().setYamlContent(data),
  reset: () => useRpcnWizardStore.getState().reset(),
};
