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

export const SECTION_LABEL: Record<NonNullable<PipelineFlowNode['section']>, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

// A node is reachable from the palette when it maps to an editable target (its own config).
// Structural wrappers (bare switch cases, merge dots) carry no target and are skipped — their
// editable entry is listed instead.
export function jumpableNodes(nodes: PipelineFlowNode[]): PipelineFlowNode[] {
  return nodes.filter((n) => n.editTarget && n.section);
}

// Free text a node matches on: its VISIBLE fields only (connector name, user label, role). cmdk
// fuzzy-matches the whole `value`, so internal node ids must stay out — they made typing "0" or
// "section" match rows for no visible reason. Uniqueness (when two nodes share a name) comes from
// a zero-width-space suffix the user can't type.
export function searchValue(node: PipelineFlowNode, index: number): string {
  const visible = [node.label, node.labelText, node.section].filter(Boolean).join(' ');
  return `${visible}${'\u200B'.repeat(index + 1)}`;
}

// Meta values (topics, urls, …) stay searchable via cmdk's `keywords` — user-authored content,
// unlike the synthetic ids.
export function searchKeywords(node: PipelineFlowNode): string[] | undefined {
  const keywords = node.meta?.map((m) => m.value).filter(Boolean);
  return keywords?.length ? keywords : undefined;
}
