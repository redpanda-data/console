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

import { useEffect, useRef, useState } from 'react';
import { getWizardConnectionData, useOnboardingYamlContentStore } from 'state/onboarding-wizard-store';

import { generateYamlFromWizardData } from './yaml';
import type { ConnectComponentSpec } from '../types/schema';

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Resolves the initial YAML content for create mode and pushes it to the
 * consumer via `onResolved`. Handles two paths:
 *
 * 1. Serverless mode (?serverless=true): waits for the component list, then
 *    generates templates from the onboarding wizard's session data.
 *    Note: we don't gate on store hydration — getWizardConnectionData() reads
 *    sessionStorage directly as a fallback when the Zustand store hasn't hydrated
 *    (which happens on SPA navigation when the store was previously reset).
 * 2. Non-serverless create mode: restores previously-persisted YAML from the
 *    in-memory onboarding YAML store (survives same-session navigation).
 */
export function useCreateModeInitialYaml(opts: {
  enabled: boolean;
  isServerlessMode: boolean;
  components: ConnectComponentSpec[];
  isPipelineDiagramsEnabled: boolean;
  onResolved: (yaml: string) => void;
  timeoutMs?: number;
}): {
  isInitializing: boolean;
} {
  const { enabled, isServerlessMode, components, isPipelineDiagramsEnabled, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const persistedYamlContent = useOnboardingYamlContentStore((s) => s.yamlContent);
  const onResolvedRef = useRef(opts.onResolved);
  onResolvedRef.current = opts.onResolved;

  const [resolved, setResolved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Timeout: only applies to serverless mode where we wait for async prerequisites
  useEffect(() => {
    if (!(enabled && isServerlessMode) || resolved) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [enabled, isServerlessMode, resolved, timeoutMs]);

  // Serverless path: generate YAML from wizard data once components are loaded
  useEffect(() => {
    if (!(enabled && isServerlessMode) || resolved || components.length === 0) {
      return;
    }

    const { input, output } = getWizardConnectionData();
    const yaml = generateYamlFromWizardData(input, output, components);

    if (yaml && !isPipelineDiagramsEnabled) {
      useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: yaml });
    }

    if (yaml) {
      onResolvedRef.current(yaml);
    }
    setResolved(true);
  }, [enabled, isServerlessMode, components, isPipelineDiagramsEnabled, resolved]);

  // Non-serverless path: restore persisted YAML from in-memory store
  useEffect(() => {
    if (!enabled || isServerlessMode || isPipelineDiagramsEnabled || resolved || !persistedYamlContent) {
      return;
    }
    onResolvedRef.current(persistedYamlContent);
    setResolved(true);
  }, [enabled, isServerlessMode, isPipelineDiagramsEnabled, persistedYamlContent, resolved]);

  return { isInitializing: enabled && isServerlessMode && !resolved && !timedOut };
}
