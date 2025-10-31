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
import { devtools, persist } from 'zustand/middleware';

import type {
  MinimalTopicData,
  MinimalUserData,
  OnboardingWizardFormData,
} from '../components/pages/rp-connect/types/wizard';

export const CONNECT_WIZARD_CONNECTOR_KEY = 'connect-wizard-connections';

const initialWizardData: Partial<OnboardingWizardFormData> = {};
const initialTopicData: Partial<MinimalTopicData> = {};
const initialUserData: Partial<MinimalUserData> = {};

export const useOnboardingWizardDataStore = create<
  Partial<OnboardingWizardFormData> & {
    setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
    reset: () => void;
    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
  }
>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialWizardData,
        _hasHydrated: false,
        setWizardData: (data) => set(data),
        reset: () => {
          sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
          return set(
            {
              ...initialWizardData,
              setWizardData: get().setWizardData,
              reset: get().reset,
              _hasHydrated: false,
              setHasHydrated: get().setHasHydrated,
            },
            true
          );
        },
        setHasHydrated: (state) => set({ _hasHydrated: state }),
      }),
      {
        name: CONNECT_WIZARD_CONNECTOR_KEY,
        storage: createFlatStorage<Partial<OnboardingWizardFormData>>(),
        partialize: (state) => ({
          input: state.input,
          output: state.output,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      }
    )
  )
);

export const useOnboardingTopicDataStore = create<
  Partial<MinimalTopicData> & {
    setTopicData: (data: Partial<MinimalTopicData>) => void;
    reset: () => void;
  }
>()((set, get) => ({
  ...initialTopicData,
  setTopicData: (data) => set(data),
  reset: () => set({ ...initialTopicData, setTopicData: get().setTopicData, reset: get().reset }, true),
}));

export const useOnboardingUserDataStore = create<
  Partial<MinimalUserData> & {
    setUserData: (data: Partial<MinimalUserData>) => void;
    reset: () => void;
  }
>()((set, get) => ({
  ...initialUserData,
  setUserData: (data) => set(data),
  reset: () => set({ ...initialUserData, setUserData: get().setUserData, reset: get().reset }, true),
}));

type OnboardingYamlContent = {
  yamlContent: undefined | string;
};

const initialYamlContent: OnboardingYamlContent = {
  yamlContent: undefined,
};

export const useOnboardingYamlContentStore = create<
  OnboardingYamlContent & {
    setYamlContent: (data: OnboardingYamlContent) => void;
    reset: () => void;
  }
>()((set, get) => ({
  ...initialYamlContent,
  setYamlContent: (data) => set(data),
  reset: () => set({ ...initialYamlContent, setYamlContent: get().setYamlContent, reset: get().reset }, true),
}));

export const useResetOnboardingWizardStore = () =>
  useCallback(() => {
    useOnboardingWizardDataStore.getState().reset();
    useOnboardingTopicDataStore.getState().reset();
    useOnboardingUserDataStore.getState().reset();
    useOnboardingYamlContentStore.getState().reset();
  }, []);

// Imperative API for non-hook contexts (class components, utility functions)
export const onboardingWizardStore = {
  getWizardData: () => {
    const {
      setWizardData: _,
      reset: __,
      _hasHydrated: ___,
      setHasHydrated: ____,
      ...data
    } = useOnboardingWizardDataStore.getState();
    return data;
  },
  getTopicData: () => {
    const { setTopicData: _, reset: __, ...data } = useOnboardingTopicDataStore.getState();
    return data;
  },
  getUserData: () => {
    const { setUserData: _, reset: __, ...data } = useOnboardingUserDataStore.getState();
    return data;
  },
  getYamlContent: () => {
    const { setYamlContent: _, reset: __, ...data } = useOnboardingYamlContentStore.getState();
    return data;
  },
  hasHydrated: () => useOnboardingWizardDataStore.getState()._hasHydrated,
  setWizardData: (data: Partial<OnboardingWizardFormData>) =>
    useOnboardingWizardDataStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useOnboardingTopicDataStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useOnboardingUserDataStore.getState().setUserData(data),
  setYamlContent: (data: OnboardingYamlContent) => useOnboardingYamlContentStore.getState().setYamlContent(data),
  reset: () => {
    useOnboardingWizardDataStore.getState().reset();
    useOnboardingTopicDataStore.getState().reset();
    useOnboardingUserDataStore.getState().reset();
    useOnboardingYamlContentStore.getState().reset();
  },
};
