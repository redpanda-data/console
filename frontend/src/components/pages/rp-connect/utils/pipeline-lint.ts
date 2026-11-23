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

import { type PipelineFlowNode, parseEditableNodes } from './pipeline-flow-parser';
import { classifyIdleTimeout, type IdleTimeoutKind } from './read-until';
import { editTargetPath, READ_UNTIL, readStopCondition, type StopCondition, slotComponentKey } from './yaml';

type NodeRange = { id: string; start: number; end: number; span: number };

function yamlNodeLines(doc: Document, lineCounter: LineCounter, path: (string | number)[]) {
  const yamlNode = doc.getIn(path, true) as { range?: [number, number, number] } | undefined;
  const range = yamlNode?.range;
  if (!range) {
    return;
  }
  const start = lineCounter.linePos(range[0]).line;
  const endPos = lineCounter.linePos(range[1]);
  const end = endPos.col === 1 && endPos.line > start ? endPos.line - 1 : endPos.line;
  return { start, end };
}

function caseEntryId(node: PipelineFlowNode, nodes: PipelineFlowNode[]) {
  const entryId = node.kind === 'leaf' ? node.id : nodes.find((n) => n.parentId === node.id)?.id;
  return entryId ?? node.id;
}

export function nodeLineRanges(yaml: string) {
  const lineCounter = new LineCounter();
  const { doc, nodes } = parseEditableNodes(yaml, lineCounter);
  const ranges: NodeRange[] = [];
  const pushRange = (id: string, path: (string | number)[]) => {
    const lines = yamlNodeLines(doc, lineCounter, path);
    if (lines) {
      ranges.push({ id, start: lines.start, end: lines.end, span: lines.end - lines.start });
    }
  };
  for (const node of nodes) {
    for (const [id, path] of nodeRangePaths(node, nodes)) {
      pushRange(id, path);
    }
  }
  return ranges;
}

function nodeRangePaths(node: PipelineFlowNode, nodes: PipelineFlowNode[]) {
  const paths: [string, (string | number)[]][] = [];
  if (node.editTarget && node.editTarget.kind !== 'switchCase') {
    paths.push([node.id, editTargetPath(node.editTarget)]);
  }
  if (node.caseEditTarget) {
    paths.push([caseEntryId(node, nodes), editTargetPath(node.caseEditTarget)]);
  }
  return paths;
}

/**
 * Merge save-error lint hints with live-lint hints, deduping: after a failed save the same problem
 * arrives from both sources under different keys. The error-derived copy wins (carries `lintType`).
 */
export function mergeLintHints(
  errorHints: Record<string, LintHint>,
  queryHints: readonly LintHint[],
  localHints: readonly LintHint[] = []
) {
  const merged: Record<string, LintHint> = {};
  const seen = new Set<string>();
  addUnseenHints(merged, seen, Object.entries(errorHints), 'error_');
  addUnseenHints(merged, seen, localHints.entries(), 'local_');
  addUnseenHints(merged, seen, queryHints.entries(), 'lint_hint_');
  return merged;
}

function addUnseenHints(
  merged: Record<string, LintHint>,
  seen: Set<string>,
  entries: Iterable<[string | number, LintHint]>,
  keyPrefix: string
) {
  for (const [key, hint] of entries) {
    const signature = `${hint.line}:${hint.column}:${hint.hint}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      merged[`${keyPrefix}${key}`] = hint;
    }
  }
}

/**
 * Client-side YAML syntax lint (1-based line/column) so invalid YAML shows without a save round-trip.
 * `prettyErrors: false` keeps each message to a single clean line (no embedded code snippet).
 */
export function localYamlLintHints(configYaml: string) {
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

const lintAt = (lineCounter: LineCounter, node: unknown, hint: string) => {
  const offset = (node as { range?: [number, number, number] } | undefined)?.range?.[0] ?? 0;
  const pos = lineCounter.linePos(offset);
  return create(LintHintSchema, { line: pos.line, column: pos.col, hint, lintType: 'config' });
};

const IDLE_TIMEOUT_PROBLEM: Partial<Record<IdleTimeoutKind, string>> = {
  invalid: 'idle_timeout must be a duration such as 30s, 5m or 1h.',
  zero: 'An idle_timeout of 0 never fires. Use a duration such as 30s.',
  negative: 'A negative idle_timeout is ignored. Use a duration such as 30s.',
};

function missingWrapperParts(resolved: Record<string, unknown>, stop: StopCondition) {
  const missing: string[] = [];
  const idle = classifyIdleTimeout(stop.idleTimeout);
  const idleGiven = idle !== 'unset' && idle !== 'negative';
  if (!(stop.check || idleGiven)) {
    missing.push('read_until needs a check or an idle_timeout to know when to stop.');
  }
  if (!slotComponentKey(resolved.input)) {
    missing.push('read_until needs an input to read from.');
  }
  return missing;
}

function readUntilProblems(lineCounter: LineCounter, doc: Document, keyNode: unknown, value: YAMLMap | null) {
  const resolved = (value?.toJS(doc) ?? {}) as Record<string, unknown>;
  const stop = readStopCondition(resolved);
  const hints = missingWrapperParts(resolved, stop).map((hint) => lintAt(lineCounter, keyNode, hint));
  const idleProblem = IDLE_TIMEOUT_PROBLEM[classifyIdleTimeout(stop.idleTimeout)];
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
export function localStopConditionLintHints(configYaml: string) {
  if (!configYaml.includes(READ_UNTIL)) {
    return [];
  }
  const lineCounter = new LineCounter();
  const doc = parseDocument(configYaml, { lineCounter, merge: true });
  if (doc.errors.length > 0) {
    return [];
  }
  try {
    return readUntilHints(doc, lineCounter);
  } catch {
    return [];
  }
}

function readUntilHints(doc: Document, lineCounter: LineCounter) {
  const hints: LintHint[] = [];
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
  return hints;
}

export function enclosingNodeId(line: number, ranges: NodeRange[]) {
  let best: NodeRange | undefined;
  for (const range of ranges) {
    if (line >= range.start && line <= range.end && (!best || range.span < best.span)) {
      best = range;
    }
  }
  return best?.id;
}

function nodeLineRangesOrUndefined(yaml: string) {
  try {
    return nodeLineRanges(yaml);
  } catch {}
}

function groupHintsByNode(hints: LintHint[], ranges: NodeRange[]) {
  const byNode = new Map<string, LintHint[]>();
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

export function mapLintHintsToNodes(yaml: string, hints: LintHint[]): Map<string, LintHint[]> {
  if (!yaml || hints.length === 0) {
    return new Map();
  }
  const ranges = nodeLineRangesOrUndefined(yaml);
  return ranges ? groupHintsByNode(hints, ranges) : new Map();
}
