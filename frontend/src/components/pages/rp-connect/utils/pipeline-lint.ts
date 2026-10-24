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
import {
  type Document,
  isMap,
  isPair,
  isScalar,
  LineCounter,
  type Pair,
  parseDocument,
  visit,
  type YAMLMap,
} from 'yaml';

import { parseEditableNodes } from './pipeline-flow-parser';
import { idleTimeoutFires, isEnvRef, isIdleTimeoutParseable, isIdleTimeoutSet } from './read-until';
import { editTargetPath, READ_UNTIL, readStopCondition, slotComponentKey } from './yaml';

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
    // A wrapped input's `read_until` settings sit outside its component — attribute them to it too.
    if (node.stopSlot?.condition) {
      pushRange(node.id, node.stopSlot.path);
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

const READ_UNTIL_ROOTS: ReadonlySet<unknown> = new Set(['input', 'input_resources']);

const lintAt = (lineCounter: LineCounter, node: unknown, hint: string): LintHint => {
  const offset = (node as { range?: [number, number, number] } | undefined)?.range?.[0] ?? 0;
  const pos = lineCounter.linePos(offset);
  return create(LintHintSchema, { line: pos.line, column: pos.col, hint, lintType: 'config' });
};

// The idle timeout's own problem: one Connect rejects at start, or one it accepts but never fires.
function idleTimeoutProblem(idle: string): string | undefined {
  if (!isIdleTimeoutParseable(idle)) {
    return 'idle_timeout must be a duration such as 30s, 5m or 1h.';
  }
  if (isEnvRef(idle) || idleTimeoutFires(idle)) {
    return;
  }
  return isIdleTimeoutSet(idle)
    ? 'An idle_timeout of 0 never fires. Use a duration such as 30s.'
    : 'A negative idle_timeout is ignored. Use a duration such as 30s.';
}

// What a `read_until` value is missing for Connect to build it, or sets but never acts on, as hints on its own keys.
// A null value (`read_until:` with nothing under it) is missing everything.
function readUntilProblems(
  lineCounter: LineCounter,
  doc: Document,
  keyNode: unknown,
  value: YAMLMap | null
): LintHint[] {
  const hints: LintHint[] = [];
  // Merge keys resolved, as Connect sees the wrapper.
  const resolved = (value?.toJS(doc) ?? {}) as Record<string, unknown>;
  const stop = readStopCondition(resolved);
  // An unparseable timeout fails on its own, so it isn't also reported as missing.
  const idleGiven =
    stop.idleTimeout !== undefined && (!isIdleTimeoutParseable(stop.idleTimeout) || isIdleTimeoutSet(stop.idleTimeout));
  if (!(stop.check || idleGiven)) {
    hints.push(lintAt(lineCounter, keyNode, 'read_until needs a check or an idle_timeout to know when to stop.'));
  }
  if (!slotComponentKey(resolved.input)) {
    hints.push(lintAt(lineCounter, keyNode, 'read_until needs an input to read from.'));
  }
  const idleProblem = stop.idleTimeout === undefined ? undefined : idleTimeoutProblem(stop.idleTimeout);
  if (idleProblem) {
    const idlePair = value?.items.find((p) => isScalar(p.key) && p.key.value === 'idle_timeout');
    hints.push(lintAt(lineCounter, idlePair?.key ?? keyNode, idleProblem));
  }
  return hints;
}

/**
 * Stop conditions Connect's lint accepts but that fail when the pipeline starts (a `read_until` with
 * nothing to stop on or no input, an `idle_timeout` that isn't a duration) or never fire (a zero or
 * negative `idle_timeout`).
 */
export function localStopConditionLintHints(configYaml: string): LintHint[] {
  if (!configYaml.includes(READ_UNTIL)) {
    return [];
  }
  const lineCounter = new LineCounter();
  const doc = parseDocument(configYaml, { lineCounter, merge: true });
  if (doc.errors.length > 0) {
    return [];
  }
  const hints: LintHint[] = [];
  try {
    visit(doc, {
      Pair(_, pair, path) {
        const empty = pair.value === null || (isScalar(pair.value) && pair.value.value === null);
        if (!(isScalar(pair.key) && pair.key.value === READ_UNTIL && (isMap(pair.value) || empty))) {
          return;
        }
        const root = path.find((n) => isPair(n)) as Pair | undefined;
        if (root && isScalar(root.key) && READ_UNTIL_ROOTS.has(root.key.value)) {
          hints.push(...readUntilProblems(lineCounter, doc, pair.key, isMap(pair.value) ? pair.value : null));
        }
      },
    });
  } catch {
    // Resolving a wrapper throws on excessive alias expansion; lint runs during render.
    return [];
  }
  return hints;
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
