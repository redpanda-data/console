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

// Main onboarding wizard state interface
interface OnboardingWizardState {
  // Form data for each step
  addDataFormData: AddDataFormData | undefined;
  addTopicFormData: AddTopicFormData | undefined;
  addUserFormData: AddUserFormData | undefined;

  // Actions to update form data
  setAddDataFormData: (data: AddDataFormData) => void;
  setAddTopicFormData: (data: AddTopicFormData) => void;
  setAddUserFormData: (data: AddUserFormData) => void;

  // Utility actions
  clearAllFormData: () => void;
  getCompletedSteps: () => string[];
}

// Create the Zustand store with persistence
export const useOnboardingWizardStore = create<OnboardingWizardState>()(
  persist(
    (set, get) => ({
      // Initial state
      addDataFormData: undefined,
      addTopicFormData: undefined,
      addUserFormData: undefined,

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
    }),
    {
      name: 'onboarding-wizard-storage', // localStorage key
      partialize: (state) => ({
        // Only persist the form data, not the actions
        addDataFormData: state.addDataFormData,
        addTopicFormData: state.addTopicFormData,
        addUserFormData: state.addUserFormData,
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

// Export the main store for direct access if needed
export default useOnboardingWizardStore;

// Helper function to completely clear all persisted data
export const clearAllPersistedData = () => {
  // Clear the localStorage data using the persist API
  useOnboardingWizardStore.persist.clearStorage();

  // Clear in-memory state
  useOnboardingWizardStore.getState().clearAllFormData();
};
