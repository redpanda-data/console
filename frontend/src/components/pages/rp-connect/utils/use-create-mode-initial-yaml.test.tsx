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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { CONNECT_WIZARD_CONNECTOR_KEY, useRpcnWizardStore } from 'state/rpcn-wizard-store';
import { parse as parseYaml } from 'yaml';

import { mockGenerateInput } from './__fixtures__/component-schemas';
import { useCreateModeInitialYaml } from './use-create-mode-initial-yaml';

const components = [mockGenerateInput];
const persistedYaml = 'input: {http_client: {url: "http://example.com"}}';
const generatorChoice = { connectionName: 'generate', connectionType: 'input' } as const;

type EditorOptions = Omit<Parameters<typeof useCreateModeInitialYaml>[0], 'onResolved'>;

const defaults: EditorOptions = {
  enabled: true,
  isServerlessMode: true,
  components,
  isPipelineDiagramsEnabled: false,
};

function mountInitialYaml(overrides: Partial<EditorOptions> = {}) {
  const resolved: string[] = [];
  const render = renderHook(
    (options: Partial<EditorOptions>) =>
      useCreateModeInitialYaml({ ...defaults, ...overrides, ...options, onResolved: (yaml) => resolved.push(yaml) }),
    { initialProps: {} }
  );
  return { ...render, resolved };
}

function setGeneratorChoice() {
  useRpcnWizardStore.getState().setWizardData({ input: generatorChoice });
}

function expectGenerateConfig(yaml: string) {
  expect(parseYaml(yaml)).toMatchObject({ input: { generate: expect.any(Object) } });
}

describe('create-mode YAML initialization', () => {
  beforeEach(() => {
    useRpcnWizardStore.getState().reset();
  });

  afterEach(() => {
    useRpcnWizardStore.getState().reset();
    rs.useRealTimers();
  });

  test('does not initialize a disabled editor even with data ready', () => {
    setGeneratorChoice();
    const { result, resolved } = mountInitialYaml({ enabled: false });

    expect(result.current.isInitializing).toBe(false);
    expect(resolved).toEqual([]);
    expect(useRpcnWizardStore.getState().yamlContent).toBeUndefined();
  });

  test('waits for the catalog, consumes a late wizard choice once, and keeps it for legacy reopen', () => {
    const { rerender, result, resolved } = mountInitialYaml({ components: [] });
    expect(result.current.isInitializing).toBe(true);
    expect(resolved).toEqual([]);

    sessionStorage.setItem(CONNECT_WIZARD_CONNECTOR_KEY, JSON.stringify({ input: generatorChoice }));
    rerender({ components });

    expectGenerateConfig(resolved[0]);
    expect(result.current.isInitializing).toBe(false);
    expect(useRpcnWizardStore.getState().yamlContent).toBe(resolved[0]);
    rerender({ components: [...components] });
    expect(resolved).toHaveLength(1);
  });

  test('initializes the diagram without overwriting the legacy wizard YAML', () => {
    setGeneratorChoice();
    useRpcnWizardStore.getState().setYamlContent({ yamlContent: persistedYaml });

    const { result, resolved } = mountInitialYaml({ isPipelineDiagramsEnabled: true });

    expectGenerateConfig(resolved[0]);
    expect(result.current.isInitializing).toBe(false);
    expect(useRpcnWizardStore.getState().yamlContent).toBe(persistedYaml);
  });

  test('a catalog arriving after the initialization deadline does not overwrite editor work', () => {
    rs.useFakeTimers();
    setGeneratorChoice();
    const { rerender, result, resolved } = mountInitialYaml({ components: [], timeoutMs: 1000 });
    expect(result.current.isInitializing).toBe(true);

    act(() => {
      rs.advanceTimersByTime(1000);
    });
    rerender({ components });

    expect(result.current.isInitializing).toBe(false);
    expect(resolved).toEqual([]);
    expect(useRpcnWizardStore.getState().yamlContent).toBeUndefined();
  });

  test('leaves the editor empty and usable when there is no wizard choice', () => {
    const { result, resolved } = mountInitialYaml();

    expect(result.current.isInitializing).toBe(false);
    expect(resolved).toEqual([]);
  });

  test.each([
    { mode: 'persisted YAML', diagrams: false, saved: persistedYaml, expected: [persistedYaml] },
    { mode: 'diagrams enabled', diagrams: true, saved: persistedYaml, expected: [] },
    { mode: 'no saved YAML', diagrams: false, saved: undefined, expected: [] },
  ])('self-managed editor initialization: $mode', ({ diagrams, saved, expected }) => {
    setGeneratorChoice();
    useRpcnWizardStore.getState().setYamlContent({ yamlContent: saved });

    const { result, resolved } = mountInitialYaml({ isServerlessMode: false, isPipelineDiagramsEnabled: diagrams });

    expect(result.current.isInitializing).toBe(false);
    expect(resolved).toEqual(expected);
    expect(useRpcnWizardStore.getState().yamlContent).toBe(saved);
  });
});
