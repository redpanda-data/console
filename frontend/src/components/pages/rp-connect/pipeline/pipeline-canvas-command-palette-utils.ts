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

import type { PipelineFlowNode } from '../utils/pipeline-flow-parser';

// Palette-reachable nodes: ones with an editable target. Structural wrappers (bare switch cases,
// merge dots) carry no target and are skipped.
export function jumpableNodes(nodes: PipelineFlowNode[]): PipelineFlowNode[] {
  return nodes.filter((n) => n.editTarget && n.section);
}

// Match on visible fields only — cmdk fuzzy-matches the whole `value`, so internal node ids would
// cause invisible matches. Duplicate names stay unique via a zero-width-space suffix the user can't type.
export function searchValue(node: PipelineFlowNode, index: number): string {
  const visible = [node.label, node.labelText, node.section].filter(Boolean).join(' ');
  return `${visible}${'\u200B'.repeat(index + 1)}`;
}

// Meta values (topics, urls, …) stay searchable via cmdk's `keywords` — user-authored, unlike node ids.
export function searchKeywords(node: PipelineFlowNode): string[] | undefined {
  const keywords = node.meta?.map((m) => m.value).filter(Boolean);
  return keywords?.length ? keywords : undefined;
}
