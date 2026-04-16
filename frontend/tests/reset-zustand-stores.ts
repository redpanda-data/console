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
 * Reset all module-level Zustand stores used by the app. Zustand stores are
 * singletons at the module level — data written into them by page-level
 * effects stays retained in the worker process across tests, compounding the
 * +100–240 MB intra-file heap growth measured during the TDD audit.
 *
 * Zustand v5 exposes `getInitialState()` on every `create(...)` instance, so
 * we can restore initial state without modifying store definitions.
 *
 * This module is intentionally **not** imported by the global
 * `vitest.setup.integration.ts` (see comment in that file). Doing so would
 * eagerly load `src/state/backend-api`, which transitively imports
 * `src/config` and pins `isEmbedded`/`isAdpEnabled` live bindings before
 * test-file `vi.mock('config', ...)` hoists can take effect. Instead,
 * individual page-test files with heavy heap growth can import this helper
 * directly and call it from their own `afterEach`.
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
    store.setState(store.getInitialState(), true);
  }
}
