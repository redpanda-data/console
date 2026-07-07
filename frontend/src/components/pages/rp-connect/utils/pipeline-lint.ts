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

// Each editable node's [startLine, endLine] in the YAML. Lines are 1-based to match LintHint.line.
export function nodeLineRanges(yaml: string): NodeRange[] {
  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter });
  const { nodes } = parsePipelineFlowTree(yaml);
  const ranges: NodeRange[] = [];
  const pushRange = (id: string, path: (string | number)[]) => {
    const yamlNode = doc.getIn(path, true) as { range?: [number, number, number] } | undefined;
    const range = yamlNode?.range;
    if (!range) {
      return;
    }
    const start = lineCounter.linePos(range[0]).line;
    // range[1] is the node's content end (range[2] over-selects into the next line). If
    // it lands at column 1 (just past the final newline), step back to the node's last line.
    const endPos = lineCounter.linePos(range[1]);
    const end = endPos.col === 1 && endPos.line > start ? endPos.line - 1 : endPos.line;
    ranges.push({ id, start, end, span: end - start });
  };
  for (const node of nodes) {
    if (node.editTarget) {
      pushRange(node.id, editTargetPath(node.editTarget));
    }
    // A switch case's range (includes its routing `check`) is attributed to the RENDERED
    // case-entry node so a condition error highlights the case, not the whole switch. Output
    // switch: the case node itself. Processor switch (no rendered wrapper): the wrapper's first
    // child. The case span is smaller than the switch's, so `enclosingNodeId` prefers it.
    if (node.caseEditTarget) {
      // Output-switch cases are leaves (rendered themselves); processor-switch cases are group
      // wrappers whose rendered entry is their first child — so map the case's `check` range there.
      const entryId = node.kind === 'leaf' ? node.id : nodes.find((n) => n.parentId === node.id)?.id;
      if (entryId) {
        pushRange(entryId, editTargetPath(node.caseEditTarget));
      }
    }
  }
  return ranges;
}

/**
 * Merge save-error lint hints with the live lint query's hints, dropping duplicates.
 * After a failed save the same problem arrives from both sources under different keys;
 * without deduping it renders twice. The error-derived copy wins (carries `lintType`).
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

// Smallest node range containing `line` (most specific enclosing node).
export function enclosingNodeId(line: number, ranges: NodeRange[]): string | undefined {
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
