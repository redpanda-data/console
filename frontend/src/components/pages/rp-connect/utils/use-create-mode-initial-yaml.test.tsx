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

import { createComponentFixture } from './__fixtures__/component-spec';
import { useCreateModeInitialYaml } from './use-create-mode-initial-yaml';
import type { generateYamlFromWizardData } from './yaml';

const mockStoreSetYamlContent = rs.fn();
let mockPersistedYaml: string | undefined;

rs.mock('state/rpcn-wizard-store', () => ({
  useRpcnWizardStore: Object.assign(
    rs.fn((selector: (s: { yamlContent: string | undefined }) => unknown) =>
      selector({ yamlContent: mockPersistedYaml })
    ),
    {
      getState: () => ({ setYamlContent: mockStoreSetYamlContent, yamlContent: mockPersistedYaml }),
    }
  ),
  getWizardConnectionData: rs.fn(() => ({
    input: { connectionName: 'generate', connectionType: 'input' },
    output: undefined,
  })),
}));

const GENERATED_YAML = 'input:\n  generate:\n    mapping: "root = {}"';
const mockGenerateYaml = rs.fn((..._args: Parameters<typeof generateYamlFromWizardData>) => GENERATED_YAML);
rs.mock('./yaml', () => ({
  generateYamlFromWizardData: (...args: Parameters<typeof generateYamlFromWizardData>) => mockGenerateYaml(...args),
}));

const fakeComponents = [createComponentFixture({ name: 'generate', type: 'input' })];

describe('useCreateModeInitialYaml', () => {
  let onResolved: ReturnType<typeof rs.fn>;

  beforeEach(() => {
    rs.useFakeTimers();
    mockPersistedYaml = undefined;
    onResolved = rs.fn();
    mockGenerateYaml.mockReturnValue(GENERATED_YAML);
  });

  afterEach(() => {
    rs.useRealTimers();
    rs.restoreAllMocks();
  });

  test('does not call onResolved and isInitializing=false when disabled', () => {
    const { result } = renderHook(() =>
      useCreateModeInitialYaml({
        enabled: false,
        isServerlessMode: false,
        components: fakeComponents,
        isPipelineDiagramsEnabled: false,
        onResolved,
      })
    );
    expect(onResolved).not.toHaveBeenCalled();
    expect(result.current.isInitializing).toBe(false);
  });

  describe('serverless path', () => {
    test('returns isInitializing=true while waiting for components', () => {
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: [],
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(onResolved).not.toHaveBeenCalled();
      expect(result.current.isInitializing).toBe(true);
    });

    test('calls onResolved with generated YAML once components are loaded', () => {
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(onResolved).toHaveBeenCalledWith(GENERATED_YAML);
      expect(result.current.isInitializing).toBe(false);
      expect(mockGenerateYaml).toHaveBeenCalledExactlyOnceWith(
        { connectionName: 'generate', connectionType: 'input' },
        undefined,
        fakeComponents
      );
    });

    test('persists to onboarding YAML store when diagrams disabled', () => {
      renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(mockStoreSetYamlContent).toHaveBeenCalledWith({ yamlContent: GENERATED_YAML });
    });

    test('does not persist to onboarding YAML store when diagrams enabled', () => {
      renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: true,
          onResolved,
        })
      );
      expect(mockStoreSetYamlContent).not.toHaveBeenCalled();
    });

    test('times out after timeoutMs and sets isInitializing=false', () => {
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: [],
          isPipelineDiagramsEnabled: false,
          onResolved,
          timeoutMs: 1000,
        })
      );
      expect(result.current.isInitializing).toBe(true);

      act(() => {
        rs.advanceTimersByTime(1000);
      });

      expect(result.current.isInitializing).toBe(false);
      expect(onResolved).not.toHaveBeenCalled();
    });

    test('runs generation only once even if rerendered', () => {
      const { rerender } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(mockGenerateYaml).toHaveBeenCalledExactlyOnceWith(
        { connectionName: 'generate', connectionType: 'input' },
        undefined,
        fakeComponents
      );

      rerender();
      rerender();

      expect(mockGenerateYaml).toHaveBeenCalledExactlyOnceWith(
        { connectionName: 'generate', connectionType: 'input' },
        undefined,
        fakeComponents
      );
      expect(onResolved).toHaveBeenCalledExactlyOnceWith(GENERATED_YAML);
    });

    test('does not call onResolved when wizard has no data', () => {
      mockGenerateYaml.mockReturnValue('');
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(onResolved).not.toHaveBeenCalled();
      expect(result.current.isInitializing).toBe(false);
    });
  });

  describe('non-serverless path (persisted YAML)', () => {
    test('calls onResolved with persisted YAML', () => {
      mockPersistedYaml = 'input:\n  http_client:\n    url: http://example.com';
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: false,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(onResolved).toHaveBeenCalledWith('input:\n  http_client:\n    url: http://example.com');
      expect(result.current.isInitializing).toBe(false);
    });

    test('does not restore when diagrams are enabled', () => {
      mockPersistedYaml = 'input:\n  http_client:\n    url: http://example.com';
      renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: false,
          components: fakeComponents,
          isPipelineDiagramsEnabled: true,
          onResolved,
        })
      );
      expect(onResolved).not.toHaveBeenCalled();
    });

    test('does not call onResolved when no persisted YAML exists', () => {
      mockPersistedYaml = undefined;
      const { result } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: false,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(onResolved).not.toHaveBeenCalled();
      expect(result.current.isInitializing).toBe(false);
    });

    test('does not call generateYamlFromWizardData', () => {
      mockPersistedYaml = 'input:\n  http_client:\n    url: http://example.com';
      renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: false,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(mockGenerateYaml).not.toHaveBeenCalled();
    });
  });
});
