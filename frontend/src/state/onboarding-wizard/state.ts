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
import type {
  AddDataFormData,
  AddTopicFormData,
  AddUserFormData,
} from '../../components/pages/onboarding-wizard/types/forms';
import { generateConnectConfig } from '../../components/pages/onboarding-wizard/utils/connect';

export type ConnectConfig = {
  yaml: string;
  type: 'input' | 'output';
};

// Main onboarding wizard state interface
export interface OnboardingWizardState {
  // Form data for each step
  addDataFormData: AddDataFormData | undefined;
  addTopicFormData: AddTopicFormData | undefined;
  addUserFormData: AddUserFormData | undefined;
  connectConfig: ConnectConfig | undefined;

  // Actions to update form data
  setAddDataFormData: (data: AddDataFormData) => void;
  setAddTopicFormData: (data: AddTopicFormData) => void;
  setAddUserFormData: (data: AddUserFormData) => void;
  setConnectConfig: (data: ConnectConfig) => void;

  // Utility actions
  clearAllFormData: () => void;
  getCompletedSteps: () => string[];
  getAllFormData: () => Partial<AddDataFormData & AddTopicFormData & AddUserFormData>;
  getGeneratedConfig: () => { yaml: string };
  regenerateAndSaveConfig: () => void;
}

// Create the Zustand store with persistence
export const useOnboardingWizardStore = create<OnboardingWizardState>()(
  persist(
    (set, get) => ({
      // Initial state
      addDataFormData: undefined,
      addTopicFormData: undefined,
      addUserFormData: undefined,
      connectConfig: undefined,

      // Actions
      setAddDataFormData: (data: AddDataFormData) => {
        set({ addDataFormData: data });
      },

      setAddTopicFormData: (data: AddTopicFormData) => {
        set({ addTopicFormData: data });
      },

      setAddUserFormData: (data: AddUserFormData) => {
        set({ addUserFormData: data });
      },

      setConnectConfig: (data: ConnectConfig) => {
        set({ connectConfig: data });
      },

      clearAllFormData: () => {
        // Clear in-memory state
        set({
          addDataFormData: undefined,
          addTopicFormData: undefined,
          addUserFormData: undefined,
        });
      },

      getCompletedSteps: () => {
        const state = get();
        const completedSteps: string[] = [];

        if (state.addDataFormData) completedSteps.push('add-data-step');
        if (state.addTopicFormData) completedSteps.push('add-topic-step');
        if (state.addUserFormData) completedSteps.push('add-user-step');

        return completedSteps;
      },
      getAllFormData: () => {
        const state = get();
        return {
          ...state.addDataFormData,
          ...state.addTopicFormData,
          ...state.addUserFormData,
        };
      },
      getGeneratedConfig: () => {
        const state = get();
        const formData = {
          ...state.addDataFormData,
          ...state.addTopicFormData,
          ...state.addUserFormData,
        };

        // Generate config using the current form data and connectConfig
        if (state.connectConfig) {
          return generateConnectConfig(formData, state.connectConfig);
        }
        return { yaml: '' };
      },
      regenerateAndSaveConfig: () => {
        const state = get();
        const formData = {
          ...state.addDataFormData,
          ...state.addTopicFormData,
          ...state.addUserFormData,
        };

        // Generate config and update the store
        if (state.connectConfig) {
          const result = generateConnectConfig(formData, state.connectConfig);
          set({
            connectConfig: {
              yaml: result.yaml,
              type: state.connectConfig.type,
            },
          });
        } else {
          console.log('No connectConfig found in state');
        }
      },
    }),
    {
      name: 'onboarding-wizard-storage', // localStorage key
      partialize: (state) => ({
        // Only persist the form data, not the actions
        addDataFormData: state.addDataFormData,
        addTopicFormData: state.addTopicFormData,
        addUserFormData: state.addUserFormData,
        connectConfig: state.connectConfig,
      }),
    },
  ),
);

// Convenience hooks for individual form data
export const useAddDataFormData = () =>
  useOnboardingWizardStore((state) => ({
    data: state.addDataFormData,
    setData: state.setAddDataFormData,
  }));

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

export const useConnectConfig = () => {
  return useOnboardingWizardStore((state) => ({
    data: state.connectConfig,
    setData: state.setConnectConfig,
  }));
};

// Export the main store for direct access if needed
export default useOnboardingWizardStore;
