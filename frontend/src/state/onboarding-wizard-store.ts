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

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  MinimalTopicData,
  MinimalUserData,
  OnboardingWizardFormData,
} from '../components/pages/rp-connect/types/wizard';

export const CONNECT_WIZARD_CONNECTOR_KEY = 'connect-wizard-connections';
export const CONNECT_WIZARD_TOPIC_KEY = 'connect-wizard-topic';
export const CONNECT_WIZARD_USER_KEY = 'connect-wizard-user';

type OnboardingWizardState = {
  wizardData: Partial<OnboardingWizardFormData>;
  topicData: Partial<MinimalTopicData>;
  userData: Partial<MinimalUserData>;
  setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
  setTopicData: (data: Partial<MinimalTopicData>) => void;
  setUserData: (data: Partial<MinimalUserData>) => void;
  reset: () => void;
};

export const useOnboardingWizardDataStore = create<{
  wizardData: Partial<OnboardingWizardFormData>;
  setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
  rehydrate: () => void;
}>()(
  persist(
    (set) => ({
      wizardData: {},
      setWizardData: (data) => set({ wizardData: data }),
      rehydrate: () => {
        const storedValue = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
        if (storedValue) {
          try {
            const parsed = JSON.parse(storedValue);
            if (parsed?.state?.wizardData) {
              set({ wizardData: parsed.state.wizardData });
            }
          } catch {
            // Silently fail if rehydration fails - store will keep current state
          }
        }
      },
    }),
    {
      name: CONNECT_WIZARD_CONNECTOR_KEY,
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

export const useOnboardingTopicDataStore = create<{
  topicData: Partial<MinimalTopicData>;
  setTopicData: (data: Partial<MinimalTopicData>) => void;
  rehydrate: () => void;
}>()(
  persist(
    (set) => ({
      topicData: {},
      setTopicData: (data) => set({ topicData: data }),
      rehydrate: () => {
        const storedValue = sessionStorage.getItem(CONNECT_WIZARD_TOPIC_KEY);
        if (storedValue) {
          try {
            const parsed = JSON.parse(storedValue);
            if (parsed?.state?.topicData) {
              set({ topicData: parsed.state.topicData });
            }
          } catch {
            // Silently fail if rehydration fails - store will keep current state
          }
        }
      },
    }),
    {
      name: CONNECT_WIZARD_TOPIC_KEY,
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

export const useOnboardingUserDataStore = create<{
  userData: Partial<MinimalUserData>;
  setUserData: (data: Partial<MinimalUserData>) => void;
  rehydrate: () => void;
}>()(
  persist(
    (set) => ({
      userData: {},
      setUserData: (data) => set({ userData: data }),
      rehydrate: () => {
        const storedValue = sessionStorage.getItem(CONNECT_WIZARD_USER_KEY);
        if (storedValue) {
          try {
            const parsed = JSON.parse(storedValue);
            if (parsed?.state?.userData) {
              set({ userData: parsed.state.userData });
            }
          } catch {
            // Silently fail if rehydration fails - store will keep current state
          }
        }
      },
    }),
    {
      name: CONNECT_WIZARD_USER_KEY,
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

export const useOnboardingWizardStore = (): OnboardingWizardState => {
  const { wizardData, setWizardData } = useOnboardingWizardDataStore();
  const { topicData, setTopicData } = useOnboardingTopicDataStore();
  const { userData, setUserData } = useOnboardingUserDataStore();

  const reset = () => {
    setWizardData({});
    setTopicData({});
    setUserData({});
  };

  return {
    wizardData,
    topicData,
    userData,
    setWizardData,
    setTopicData,
    setUserData,
    reset,
  };
};

// Imperative API for non-hook contexts (class components, utility functions)
export const onboardingWizardStore = {
  getWizardData: () => useOnboardingWizardDataStore.getState().wizardData,
  getTopicData: () => useOnboardingTopicDataStore.getState().topicData,
  getUserData: () => useOnboardingUserDataStore.getState().userData,
  setWizardData: (data: Partial<OnboardingWizardFormData>) =>
    useOnboardingWizardDataStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useOnboardingTopicDataStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useOnboardingUserDataStore.getState().setUserData(data),
  rehydrate: () => {
    useOnboardingWizardDataStore.getState().rehydrate();
    useOnboardingTopicDataStore.getState().rehydrate();
    useOnboardingUserDataStore.getState().rehydrate();
  },
  reset: () => {
    useOnboardingWizardDataStore.getState().setWizardData({});
    useOnboardingTopicDataStore.getState().setTopicData({});
    useOnboardingUserDataStore.getState().setUserData({});
  },
};
