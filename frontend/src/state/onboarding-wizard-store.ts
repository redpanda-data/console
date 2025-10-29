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
export const CONNECT_WIZARD_TOPIC_KEY = 'connect-wizard-topic';
export const CONNECT_WIZARD_USER_KEY = 'connect-wizard-user';

export const useOnboardingWizardDataStore = create<
  Partial<OnboardingWizardFormData> & {
    setWizardData: (data: Partial<OnboardingWizardFormData>) => void;
  }
>()(
  persist(
    (set) => ({
      setWizardData: (data) => set(data),
    }),
    {
      name: CONNECT_WIZARD_CONNECTOR_KEY,
      storage: createFlatStorage<Partial<OnboardingWizardFormData>>(),
    }
  )
);

export const useOnboardingTopicDataStore = create<
  Partial<MinimalTopicData> & {
    setTopicData: (data: Partial<MinimalTopicData>) => void;
  }
>()(
  persist(
    (set) => ({
      setTopicData: (data) => set(data),
    }),
    {
      name: CONNECT_WIZARD_TOPIC_KEY,
      storage: createFlatStorage<Partial<MinimalTopicData>>(),
    }
  )
);

export const useOnboardingUserDataStore = create<
  Partial<MinimalUserData> & {
    setUserData: (data: Partial<MinimalUserData>) => void;
  }
>()(
  persist(
    (set) => ({
      setUserData: (data) => set(data),
    }),
    {
      name: CONNECT_WIZARD_USER_KEY,
      storage: createFlatStorage<Partial<MinimalUserData>>(),
    }
  )
);

export const useResetOnboardingWizardStore = () => {
  return useCallback(() => {
    useOnboardingWizardDataStore.getState().setWizardData({});
    useOnboardingTopicDataStore.getState().setTopicData({});
    useOnboardingUserDataStore.getState().setUserData({});

    // Explicitly remove from session storage
    sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_TOPIC_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_USER_KEY);
  }, []);
};

// Imperative API for non-hook contexts (class components, utility functions)
export const onboardingWizardStore = {
  getWizardData: () => {
    const { setWizardData: _, ...data } = useOnboardingWizardDataStore.getState();
    return data;
  },
  getTopicData: () => {
    const { setTopicData: _, ...data } = useOnboardingTopicDataStore.getState();
    return data;
  },
  getUserData: () => {
    const { setUserData: _, ...data } = useOnboardingUserDataStore.getState();
    return data;
  },
  setWizardData: (data: Partial<OnboardingWizardFormData>) =>
    useOnboardingWizardDataStore.getState().setWizardData(data),
  setTopicData: (data: Partial<MinimalTopicData>) => useOnboardingTopicDataStore.getState().setTopicData(data),
  setUserData: (data: Partial<MinimalUserData>) => useOnboardingUserDataStore.getState().setUserData(data),
  reset: () => {
    useOnboardingWizardDataStore.getState().setWizardData({});
    useOnboardingTopicDataStore.getState().setTopicData({});
    useOnboardingUserDataStore.getState().setUserData({});

    sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_TOPIC_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_USER_KEY);
  },
  rehydrate: () => {
    useOnboardingWizardDataStore.persist.rehydrate();
    useOnboardingTopicDataStore.persist.rehydrate();
    useOnboardingUserDataStore.persist.rehydrate();
  },
};
