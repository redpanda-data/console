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
import { getWizardConnectionData, useRpcnWizardStore } from 'state/rpcn-wizard-store';

import { generateYamlFromWizardData } from './yaml';
import type { ConnectComponentSpec } from '../types/schema';

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Resolves the create-mode initial YAML and pushes it via `onResolved`.
 * - Serverless: waits for the component list, then generates from wizard session data.
 *   getWizardConnectionData() reads sessionStorage directly, so no store-hydration gate is needed.
 * - Non-serverless: restores persisted YAML from the in-memory onboarding store.
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
  const persistedYamlContent = useRpcnWizardStore((s) => s.yamlContent);
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
      useRpcnWizardStore.getState().setYamlContent({ yamlContent: yaml });
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
