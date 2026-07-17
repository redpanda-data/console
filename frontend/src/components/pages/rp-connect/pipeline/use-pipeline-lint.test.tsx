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

import { LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePipelineLint } from './use-pipeline-lint';

// Deterministic: skip the 500ms debounce so the hook lints the passed YAML immediately.
vi.mock('hooks/use-debounced-value', () => ({ useDebouncedValue: (v: string) => v }));

const mockUseLintQuery = vi.fn();
vi.mock('react-query/api/connect', () => ({
  useLintPipelineConfigQuery: (...args: unknown[]) => mockUseLintQuery(...args),
}));

const VALID_YAML = 'input:\n  generate: {}\noutput:\n  drop: {}';
const SYNTAX_ERROR_YAML = 'input: [unclosed';

const lintQueryResult = (overrides: Partial<{ data: unknown; isError: boolean; error: unknown }>) => ({
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  ...overrides,
});

const hint = (msg: string) => create(LintHintSchema, { line: 3, column: 1, hint: msg, lintType: 'config' });

describe('usePipelineLint', () => {
  beforeEach(() => {
    mockUseLintQuery.mockReset();
  });

  it('passes through live server-lint hints for valid YAML', () => {
    mockUseLintQuery.mockReturnValue(lintQueryResult({ data: { lintHints: [hint('missing field')] } }));
    const { result } = renderHook(() => usePipelineLint(VALID_YAML, {}, true));
    expect(Object.values(result.current.lintHints).map((h) => h.hint)).toEqual(['missing field']);
  });

  it('surfaces local YAML syntax errors, superseding save-error hints for the same broken doc', () => {
    mockUseLintQuery.mockReturnValue(lintQueryResult({}));
    const saveError = {
      save0: create(LintHintSchema, { line: 0, column: 0, hint: 'server syntax error', lintType: 'error' }),
    };
    const { result } = renderHook(() => usePipelineLint(SYNTAX_ERROR_YAML, saveError, true));
    const hints = Object.values(result.current.lintHints);
    expect(hints.length).toBeGreaterThan(0);
    // The redundant save-error copy is dropped; only the precise local hint(s) remain.
    expect(hints.every((h) => h.hint !== 'server syntax error')).toBe(true);
  });

  it('surfaces a lint RPC that rejected the config (invalid_argument)', () => {
    mockUseLintQuery.mockReturnValue(
      lintQueryResult({ isError: true, error: new ConnectError('bad config', Code.InvalidArgument) })
    );
    const { result } = renderHook(() => usePipelineLint(VALID_YAML, {}, true));
    expect(Object.values(result.current.lintHints).some((h) => h.hint.includes('bad config'))).toBe(true);
  });

  it('ignores a transient lint RPC failure so it does not fabricate a config error', () => {
    mockUseLintQuery.mockReturnValue(
      lintQueryResult({ isError: true, error: new ConnectError('service down', Code.Unavailable) })
    );
    const { result } = renderHook(() => usePipelineLint(VALID_YAML, {}, true));
    expect(result.current.lintHints).toEqual({});
  });

  it('does not run client-side lint when disabled (view mode)', () => {
    mockUseLintQuery.mockReturnValue(lintQueryResult({}));
    const { result } = renderHook(() => usePipelineLint(SYNTAX_ERROR_YAML, {}, false));
    expect(result.current.lintHints).toEqual({});
  });
});
