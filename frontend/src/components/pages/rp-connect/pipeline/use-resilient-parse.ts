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

import { useMemo, useRef } from 'react';

import {
  isConfigTextEmpty,
  isPipelineEmpty,
  type PipelineFlowNode,
  parsePipelineFlowTree,
} from '../utils/pipeline-flow-parser';

export type ResilientParse = { nodes: PipelineFlowNode[]; error?: string; showingStale: boolean };

/**
 * Hold the last REAL pipeline while an edit leaves the YAML unparseable, or valid but no longer a
 * pipeline — blanking the view (canvas or sidebar outline) reads as broken. Shared by both.
 */
export function useResilientParse(yaml: string): ResilientParse {
  const parsed = useMemo(() => parsePipelineFlowTree(yaml), [yaml]);
  const lastGoodRef = useRef<PipelineFlowNode[]>([]);
  // Only a parse with real components is a fallback worth holding; a blank config resets it (a cleared
  // editor has nothing to fall back to), and a placeholder-only parse is just the empty state.
  if (!(parsed.error || isPipelineEmpty(parsed.nodes))) {
    lastGoodRef.current = parsed.nodes;
  } else if (isConfigTextEmpty(yaml)) {
    lastGoodRef.current = [];
  }
  // Stale = the current YAML can't render as itself (unparseable, or empty over non-blank text — a
  // mis-indented/renamed section key) AND a real prior pipeline exists to show instead.
  const brokenOverContent = !parsed.error && isPipelineEmpty(parsed.nodes) && !isConfigTextEmpty(yaml);
  const showingStale = (Boolean(parsed.error) || brokenOverContent) && lastGoodRef.current.length > 0;
  return { nodes: showingStale ? lastGoodRef.current : parsed.nodes, error: parsed.error, showingStale };
}
