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

import { type LintHint, LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { LineCounter, parseDocument } from 'yaml';

import { parseEditableNodes } from './pipeline-flow-parser';
import { editTargetPath } from './yaml';

type NodeRange = { id: string; start: number; end: number; span: number };

// Each editable node's [startLine, endLine] in the YAML. Lines are 1-based to match LintHint.line.
export function nodeLineRanges(yaml: string): NodeRange[] {
  const lineCounter = new LineCounter();
  const { doc, nodes } = parseEditableNodes(yaml, lineCounter);
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
    // A switchCase target (processor-switch case wrapper) spans the same lines as its caseEditTarget
    // and would win the enclosingNodeId tie — the case branch below attributes that range instead.
    if (node.editTarget && node.editTarget.kind !== 'switchCase') {
      pushRange(node.id, editTargetPath(node.editTarget));
    }
    // Attribute a case's range (incl. its `check`) to the rendered case-entry node — the case itself
    // (output switch) or the wrapper's first child (processor switch) — so a condition error selects
    // and outlines the entry card. An empty case falls back to the (unrendered) wrapper.
    if (node.caseEditTarget) {
      const entryId = node.kind === 'leaf' ? node.id : nodes.find((n) => n.parentId === node.id)?.id;
      pushRange(entryId ?? node.id, editTargetPath(node.caseEditTarget));
    }
  }
  return ranges;
}

/**
 * Merge save-error lint hints with live-lint hints, deduping: after a failed save the same problem
 * arrives from both sources under different keys. The error-derived copy wins (carries `lintType`).
 */
export function mergeLintHints(
  errorHints: Record<string, LintHint>,
  queryHints: readonly LintHint[],
  localHints: readonly LintHint[] = []
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
  // Locally-derived hints the live server lint can't report (YAML syntax, or a swallowed RPC failure).
  for (const [idx, hint] of localHints.entries()) {
    if (!seen.has(signature(hint))) {
      seen.add(signature(hint));
      merged[`local_${idx}`] = hint;
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

/**
 * Client-side YAML syntax lint (1-based line/column) so invalid YAML shows without a save round-trip.
 * `prettyErrors: false` keeps each message to a single clean line (no embedded code snippet).
 */
export function localYamlLintHints(configYaml: string): LintHint[] {
  if (!configYaml.trim()) {
    return [];
  }
  const lineCounter = new LineCounter();
  const doc = parseDocument(configYaml, { lineCounter, prettyErrors: false });
  return doc.errors.map((err) => {
    const pos = err.pos ? lineCounter.linePos(err.pos[0]) : undefined;
    return create(LintHintSchema, {
      line: pos?.line ?? 0,
      column: pos?.col ?? 0,
      hint: err.message,
      lintType: 'error',
    });
  });
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
