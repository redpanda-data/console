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
 * Parse the YAML, holding the last-good nodes: while it's transiently broken the parser yields no
 * pipeline, and blanking the view (canvas or structure tree) reads as broken, so freeze the last-good
 * result and flag it stale. Shared by the visual canvas and the sidebar outline so both survive an
 * edit that leaves the YAML unparseable — or valid but no longer a pipeline.
 */
export function useResilientParse(yaml: string): ResilientParse {
  const parsed = useMemo(() => parsePipelineFlowTree(yaml), [yaml]);
  const lastGoodNodesRef = useRef<PipelineFlowNode[]>([]);
  // A parse is trustworthy when it didn't throw AND it either produced real components or the text is
  // genuinely blank. Valid-but-empty YAML over non-blank text — a mis-indented or renamed section key
  // from one bad edit — is a transient break, NOT a real empty pipeline, so treat it like a parse
  // error: hold the last valid result instead of collapsing to `input: none` placeholders.
  const trustworthy = !parsed.error && (isConfigTextEmpty(yaml) || !isPipelineEmpty(parsed.nodes));
  if (trustworthy) {
    lastGoodNodesRef.current = parsed.nodes;
  }
  const showingStale = !trustworthy && lastGoodNodesRef.current.length > 0;
  return { nodes: showingStale ? lastGoodNodesRef.current : parsed.nodes, error: parsed.error, showingStale };
}
