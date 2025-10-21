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

import { createFlatStorage } from 'utils/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const API_WIZARD_CONNECTOR_NAME_KEY = 'api-wizard-connector-name';

export type APIConnectWizardFormData = {
  connectionName?: string;
};

export const useAPIWizardStore = create<
  Partial<APIConnectWizardFormData> & {
    setApiWizardData: (data: Partial<APIConnectWizardFormData>) => void;
  }
>()(
  persist(
    (set) => ({
      setApiWizardData: (data) => set(data),
    }),
    {
      name: API_WIZARD_CONNECTOR_NAME_KEY,
      storage: createFlatStorage<Partial<APIConnectWizardFormData>>(),
    }
  )
);
