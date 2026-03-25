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

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateModeInitialYaml } from './use-create-mode-initial-yaml';
import type { ConnectComponentSpec } from '../types/schema';

const mockStoreSetYamlContent = vi.fn();
let mockPersistedYaml: string | undefined;

vi.mock('state/onboarding-wizard-store', () => ({
  useOnboardingYamlContentStore: Object.assign(
    vi.fn((selector: (s: { yamlContent: string | undefined }) => unknown) =>
      selector({ yamlContent: mockPersistedYaml })
    ),
    {
      getState: () => ({ setYamlContent: mockStoreSetYamlContent, yamlContent: mockPersistedYaml }),
    }
  ),
  getWizardConnectionData: vi.fn(() => ({
    input: { connectionName: 'generate', connectionType: 'input' },
    output: undefined,
  })),
}));

const GENERATED_YAML = 'input:\n  generate:\n    mapping: "root = {}"';
const mockGenerateYaml = vi.fn(() => GENERATED_YAML);
vi.mock('./yaml', () => ({
  generateYamlFromWizardData: (...args: unknown[]) => mockGenerateYaml(...args),
}));

const fakeComponents = [{ name: 'generate', type: 'input' }] as ConnectComponentSpec[];

describe('useCreateModeInitialYaml', () => {
  let onResolved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPersistedYaml = undefined;
    onResolved = vi.fn();
    mockGenerateYaml.mockReturnValue(GENERATED_YAML);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not call onResolved and isInitializing=false when disabled', () => {
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
    it('returns isInitializing=true while waiting for components', () => {
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

    it('calls onResolved with generated YAML once components are loaded', () => {
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
      expect(mockGenerateYaml).toHaveBeenCalledOnce();
    });

    it('persists to onboarding YAML store when diagrams disabled', () => {
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

    it('does not persist to onboarding YAML store when diagrams enabled', () => {
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

    it('times out after timeoutMs and sets isInitializing=false', () => {
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
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.isInitializing).toBe(false);
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('runs generation only once even if rerendered', () => {
      const { rerender } = renderHook(() =>
        useCreateModeInitialYaml({
          enabled: true,
          isServerlessMode: true,
          components: fakeComponents,
          isPipelineDiagramsEnabled: false,
          onResolved,
        })
      );
      expect(mockGenerateYaml).toHaveBeenCalledOnce();

      rerender();
      rerender();

      expect(mockGenerateYaml).toHaveBeenCalledOnce();
      expect(onResolved).toHaveBeenCalledOnce();
    });

    it('does not call onResolved when wizard has no data', () => {
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
    it('calls onResolved with persisted YAML', () => {
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

    it('does not restore when diagrams are enabled', () => {
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

    it('does not call onResolved when no persisted YAML exists', () => {
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

    it('does not call generateYamlFromWizardData', () => {
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
