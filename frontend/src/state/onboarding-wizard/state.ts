/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddTopicFormData, AddUserFormData } from '../../components/pages/onboarding-wizard/types/forms';

export type ConnectConfig = {
  connectionName: string;
};

export interface OnboardingWizardState {
  connectConfig: ConnectConfig | undefined;
  addTopicFormData: AddTopicFormData | undefined;
  addUserFormData: AddUserFormData | undefined;

  setAddTopicFormData: (data: AddTopicFormData) => void;
  setAddUserFormData: (data: AddUserFormData) => void;
  setConnectConfig: (data: ConnectConfig) => void;

  // Utility actions
  clearAllFormData: () => void;
  getCompletedSteps: () => string[];
  getAllFormData: () => Partial<ConnectConfig & AddTopicFormData & AddUserFormData>;
}

// Create the Zustand store with persistence
export const useOnboardingWizardStore = create<OnboardingWizardState>()(
  persist(
    (set, get) => ({
      // Initial state
      addTopicFormData: undefined,
      addUserFormData: undefined,
      connectConfig: undefined,

      setConnectConfig: (data: ConnectConfig) => {
        set({ connectConfig: data });
      },

      setAddTopicFormData: (data: AddTopicFormData) => {
        set({ addTopicFormData: data });
      },

      setAddUserFormData: (data: AddUserFormData) => {
        set({ addUserFormData: data });
      },

      clearAllFormData: () => {
        // Clear in-memory state
        set({
          addTopicFormData: undefined,
          addUserFormData: undefined,
          connectConfig: undefined,
        });
      },

      getCompletedSteps: () => {
        const state = get();
        const completedSteps: string[] = [];

        if (state.connectConfig) completedSteps.push('add-data-step');
        if (state.addTopicFormData) completedSteps.push('add-topic-step');
        if (state.addUserFormData) completedSteps.push('add-user-step');

        return completedSteps;
      },
      getAllFormData: () => {
        const state = get();
        return {
          ...state.connectConfig,
          ...state.addTopicFormData,
          ...state.addUserFormData,
        };
      },
    }),
    {
      name: 'onboarding-wizard-storage', // localStorage key
      partialize: (state) => ({
        // Only persist the form data, not the actions
        connectConfig: state.connectConfig,
        addTopicFormData: state.addTopicFormData,
        addUserFormData: state.addUserFormData,
      }),
    },
  ),
);

// Selectors, kind of, but not really
export const useConnectConfig = () => {
  return useOnboardingWizardStore((state) => ({
    data: state.connectConfig,
    setData: state.setConnectConfig,
  }));
};

export const useAddTopicFormData = () =>
  useOnboardingWizardStore((state) => ({
    data: state.addTopicFormData,
    setData: state.setAddTopicFormData,
  }));

export const useAddUserFormData = () =>
  useOnboardingWizardStore((state) => ({
    data: state.addUserFormData,
    setData: state.setAddUserFormData,
  }));

export const useCompletedSteps = () => useOnboardingWizardStore((state) => state.getCompletedSteps());

export const useClearWizardStateCache = () => useOnboardingWizardStore((state) => state.clearAllFormData);
