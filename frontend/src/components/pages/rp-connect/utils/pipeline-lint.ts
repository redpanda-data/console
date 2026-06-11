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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { LineCounter, parseDocument } from 'yaml';

import { parsePipelineFlowTree } from './pipeline-flow-parser';
import { editTargetPath } from './yaml';

type NodeRange = { id: string; start: number; end: number; span: number };

// Each editable node's [startLine, endLine] in the YAML, derived from its edit
// target's YAML path. Lines are 1-based to match LintHint.line.
function nodeLineRanges(yaml: string): NodeRange[] {
  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter });
  const { nodes } = parsePipelineFlowTree(yaml);
  const ranges: NodeRange[] = [];
  for (const node of nodes) {
    if (!node.editTarget) {
      continue;
    }
    const yamlNode = doc.getIn(editTargetPath(node.editTarget), true) as
      | { range?: [number, number, number] }
      | undefined;
    const range = yamlNode?.range;
    if (!range) {
      continue;
    }
    const start = lineCounter.linePos(range[0]).line;
    const end = lineCounter.linePos(range[2] ?? range[1]).line;
    ranges.push({ id: node.id, start, end, span: end - start });
  }
  return ranges;
}

/**
 * Associate line-based lint hints with the visual node they belong to: the most
 * specific (smallest) editable node whose YAML range covers the hint's line. Hints
 * that don't fall inside any node (e.g. top-level keys) are left unmapped — they
 * still appear in the YAML lint list.
 */
/**
 * Merge save-error lint hints with the live lint query's hints, dropping
 * duplicates. After a failed save the same problem arrives from both sources
 * (the error details and the re-lint of the unchanged YAML) under different
 * keys — without deduping it renders twice on every surface. The error-derived
 * copy wins: it carries the lint name as `lintType`, shown as a heading.
 */
export function mergeLintHints(
  errorHints: Record<string, LintHint>,
  queryHints: readonly LintHint[]
): Record<string, LintHint> {
  const merged: Record<string, LintHint> = {};
  const seen = new Set<string>();
  const signature = (h: LintHint) => `${h.line}:${h.column}:${h.hint}`;

  for (const [key, hint] of Object.entries(errorHints)) {
    if (!seen.has(signature(hint))) {
      seen.add(signature(hint));
      merged[`error_${key}`] = hint;
    }
  }
  for (const [idx, hint] of queryHints.entries()) {
    if (!seen.has(signature(hint))) {
      seen.add(signature(hint));
      merged[`lint_hint_${idx}`] = hint;
    }
  }
  return merged;
}

// The smallest node range that contains `line` (most specific enclosing node).
function enclosingNodeId(line: number, ranges: NodeRange[]): string | undefined {
  let best: NodeRange | undefined;
  for (const range of ranges) {
    if (line >= range.start && line <= range.end && (!best || range.span < best.span)) {
      best = range;
    }
  }
  return best?.id;
}

export function mapLintHintsToNodes(yaml: string, hints: LintHint[]): Map<string, LintHint[]> {
  const byNode = new Map<string, LintHint[]>();
  if (!yaml || hints.length === 0) {
    return byNode;
  }

  let ranges: NodeRange[];
  try {
    ranges = nodeLineRanges(yaml);
  } catch {
    return byNode;
  }

  for (const hint of hints) {
    const id = enclosingNodeId(hint.line, ranges);
    if (!id) {
      continue;
    }
    const existing = byNode.get(id);
    if (existing) {
      existing.push(hint);
    } else {
      byNode.set(id, [hint]);
    }
  }
  return byNode;
}
