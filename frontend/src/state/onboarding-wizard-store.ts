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

// One store for the Connect onboarding wizard (was four). The `use*` aliases
// below keep existing consumers working.
type OnboardingData = Partial<OnboardingWizardFormData> &
  Partial<MinimalTopicData> &
  Partial<MinimalUserData> & { yamlContent: string | undefined };

type OnboardingStore = OnboardingData & {
  hasHydrated: boolean;
  setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
  setTopicData: (data: Partial<MinimalTopicData>) => void;
  setUserData: (data: Partial<MinimalUserData>) => void;
  setYamlContent: (data: { yamlContent: string | undefined }) => void;
  setHasHydrated: (state: boolean) => void;
  reset: () => void;
};

const initialData: OnboardingData = { yamlContent: undefined };

export const useOnboardingStore = create<OnboardingStore>()(
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

// Backward-compatible aliases — all resolve to the single store above.
export const useOnboardingWizardDataStore = useOnboardingStore;
export const useOnboardingTopicDataStore = useOnboardingStore;
export const useOnboardingUserDataStore = useOnboardingStore;
export const useOnboardingYamlContentStore = useOnboardingStore;

export const useResetOnboardingWizardStore = () => useCallback(() => useOnboardingStore.getState().reset(), []);

// Strip store metadata, leaving only the data fields.
function onboardingData(state: OnboardingStore): OnboardingData {
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

// Read connection data, falling back to session storage to cover the race where
// the store hydrated before CloudV2 wrote the data (client-side nav, no reload).
export function getWizardConnectionData(): Pick<OnboardingWizardFormData, 'input' | 'output'> {
  let input = useOnboardingStore.getState().input;
  let output = useOnboardingStore.getState().output;

  if (!(input || output)) {
    try {
      const raw = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Pick<OnboardingWizardFormData, 'input' | 'output'>>;
        input = parsed.input;
        output = parsed.output;
        // Sync the store so other consumers see the data
        useOnboardingStore.getState().setWizardData({ input, output });
      }
    } catch {
      // Ignore malformed session storage
    }
  }

  return { input, output };
}

// Imperative API for non-hook contexts (class components, utility functions).
export const onboardingWizardStore = {
  getWizardData: () => onboardingData(useOnboardingStore.getState()),
  getTopicData: () => onboardingData(useOnboardingStore.getState()),
  getUserData: () => onboardingData(useOnboardingStore.getState()),
  getYamlContent: () => onboardingData(useOnboardingStore.getState()),
  hasHydrated: () => useOnboardingStore.getState().hasHydrated,
  setWizardData: (data: Partial<OnboardingWizardFormData>) => useOnboardingStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useOnboardingStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useOnboardingStore.getState().setUserData(data),
  setYamlContent: (data: { yamlContent: string | undefined }) => useOnboardingStore.getState().setYamlContent(data),
  reset: () => useOnboardingStore.getState().reset(),
};
