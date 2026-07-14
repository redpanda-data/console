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

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useResilientParse } from './use-resilient-parse';
import { isPipelineEmpty } from '../utils/pipeline-flow-parser';

const GOOD_YAML = 'input:\n  generate:\n    mapping: root = {}\n';

const renderParse = (yaml: string) =>
  renderHook((props: { yaml: string }) => useResilientParse(props.yaml), {
    initialProps: { yaml },
  });

describe('useResilientParse', () => {
  it('holds the last real pipeline while the YAML is unparseable', () => {
    const { result, rerender } = renderParse(GOOD_YAML);
    rerender({ yaml: '{{{' });
    expect(result.current.showingStale).toBe(true);
    expect(result.current.nodes.some((n) => n.label === 'generate')).toBe(true);
  });

  it('holds the last real pipeline when valid YAML loses its components mid-edit', () => {
    const { result, rerender } = renderParse(GOOD_YAML);
    rerender({ yaml: 'input:\n' });
    expect(result.current.showingStale).toBe(true);
    expect(result.current.nodes.some((n) => n.label === 'generate')).toBe(true);
  });

  it('resets to the empty state when the config text is cleared', () => {
    const { result, rerender } = renderParse(GOOD_YAML);
    rerender({ yaml: '' });
    expect(result.current.showingStale).toBe(false);
    expect(isPipelineEmpty(result.current.nodes)).toBe(true);
  });

  it('resets to the empty state on a {} document (deleting the last node), not the stale pipeline', () => {
    const { result, rerender } = renderParse(GOOD_YAML);
    rerender({ yaml: '{}' });
    expect(result.current.showingStale).toBe(false);
    expect(isPipelineEmpty(result.current.nodes)).toBe(true);
  });
});
