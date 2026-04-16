/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Reset all module-level Zustand stores used by the app between integration
 * tests. RTL's `cleanup()` unmounts React components, but Zustand stores are
 * singletons at the module level — every piece of data written into them via
 * the Connect/React-Query effects of a page under test remains held in memory
 * for the life of the worker, which compounds across dozens of tests in a
 * single file and produces the +100–240 MB intra-file heap growth we saw in
 * the TDD audit.
 *
 * Zustand v5 exposes `store.getInitialState()` on every `create(...)` / vanilla
 * `createStore(...)` instance, so we can snapshot the initial state and
 * restore it after each test without modifying the store definitions
 * themselves.
 */

import { useAPIWizardStore } from '../src/state/api-wizard-store';
import {
  useApiStore,
  useKnowledgebaseStore,
  usePipelinesStore,
  useRolesStore,
  useRpcnSecretManagerStore,
  useTransformsStore,
} from '../src/state/backend-api';
import {
  useOnboardingTopicDataStore,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
} from '../src/state/onboarding-wizard-store';
import { useSupportedFeaturesStore } from '../src/state/supported-features';
import { useUISettingsStore } from '../src/state/ui';
import { useUIStateStore } from '../src/state/ui-state';
import { useTopicSettingsStore } from '../src/stores/topic-settings-store';

type ResettableStore = {
  getInitialState: () => unknown;
  setState: (state: unknown, replace: true) => void;
};

// Listed explicitly (not discovered reflectively) so a new store added in
// application code is a deliberate decision in test infra, not a silent leak.
const stores: ResettableStore[] = [
  useApiStore as unknown as ResettableStore,
  useRolesStore as unknown as ResettableStore,
  usePipelinesStore as unknown as ResettableStore,
  useKnowledgebaseStore as unknown as ResettableStore,
  useRpcnSecretManagerStore as unknown as ResettableStore,
  useTransformsStore as unknown as ResettableStore,
  useUIStateStore as unknown as ResettableStore,
  useUISettingsStore as unknown as ResettableStore,
  useSupportedFeaturesStore as unknown as ResettableStore,
  useOnboardingWizardDataStore as unknown as ResettableStore,
  useOnboardingTopicDataStore as unknown as ResettableStore,
  useOnboardingUserDataStore as unknown as ResettableStore,
  useOnboardingYamlContentStore as unknown as ResettableStore,
  useAPIWizardStore as unknown as ResettableStore,
  useTopicSettingsStore as unknown as ResettableStore,
];

export function resetAllZustandStores(): void {
  for (const store of stores) {
    // `replace: true` forces a full replacement — partial merges leave the
    // previous keys around, which is exactly the leak we're trying to avoid.
    store.setState(store.getInitialState(), true);
  }
}
