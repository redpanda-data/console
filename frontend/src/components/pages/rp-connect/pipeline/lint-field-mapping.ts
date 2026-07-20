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
import { isMap, isScalar, LineCounter, parseDocument } from 'yaml';

import { type EditTarget, editTargetPath } from '../utils/yaml';

/**
 * Anchors a node's lint hints to the inspector form fields they belong to, so an error renders
 * under the field it's about instead of as "(line 12)" in a banner the user has to decode.
 *
 * Two signals, in order of precedence:
 * 1. Line: the hint's line falls inside a field's YAML range (computed from the parsed document's
 *    node ranges — the same technique the switch-case `check` field already used).
 * 2. Mention: the hint's text names a field ("either topics or regexp_topics_include must be
 *    specified"); underscores match spaces too, so "consumer group" finds `consumer_group`. This
 *    catches missing-field errors, whose line can only point at the component itself.
 *
 * Hints that anchor to nothing the form renders stay in `unmapped` for the banner.
 */

/** Field-key (leaf `path.join('/')`) → the lint messages anchored to it. */
export type FieldLintErrors = ReadonlyMap<string, string[]>;

type FieldSegment = { key: string; depth: number; startLine: number; endLine: number };

type RangedNode = { range?: [number, number, number] | null } | null | undefined;

// Record a segment per mapping pair, recursing into nested mappings. Children are deeper, so the
// deepest segment containing a line wins during lookup.
function walkMapping(node: unknown, prefix: string[], out: FieldSegment[], lineCounter: LineCounter): void {
  if (!isMap(node)) {
    return;
  }
  for (const pair of node.items) {
    const keyNode = pair.key;
    if (!(isScalar(keyNode) && typeof keyNode.value === 'string' && keyNode.range)) {
      continue;
    }
    const path = [...prefix, keyNode.value];
    const valueRange = (pair.value as RangedNode)?.range;
    // Value-end (range[1]), not node-end (range[2]) — node-end swallows trailing blank lines,
    // which would bleed a hint on the next sibling's line into this field.
    const endOffset = valueRange ? valueRange[1] : keyNode.range[1];
    out.push({
      key: path.join('/'),
      depth: path.length,
      startLine: lineCounter.linePos(keyNode.range[0]).line,
      endLine: lineCounter.linePos(Math.max(endOffset - 1, keyNode.range[0])).line,
    });
    walkMapping(pair.value, path, out, lineCounter);
  }
}

// The deepest field whose YAML range contains the line.
function fieldKeyForLine(segments: readonly FieldSegment[], line: number): string | undefined {
  let best: FieldSegment | undefined;
  for (const segment of segments) {
    if (line >= segment.startLine && line <= segment.endLine && (!best || segment.depth > best.depth)) {
      best = segment;
    }
  }
  return best?.key;
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
// Below this, a field name is too generic to trust as a loose mention ("id", "to") — but an
// explicit `field X …` reference (see FIELD_TOKEN_RE) is exact and has no length limit.
const MIN_MENTION_NAME_LENGTH = 3;

// The lint convention for structural errors: "field id is required", "field `host` is required".
const FIELD_TOKEN_RE = /\bfield\s+[`'"]?([A-Za-z0-9_.]+)[`'"]?/gi;

// Fields the hint names via the exact "field X" convention — precise, so any name length counts.
function fieldKeysNamedExplicitly(hintText: string, fieldKeys: ReadonlySet<string>): string[] {
  const tokens = new Set<string>();
  for (const match of hintText.matchAll(FIELD_TOKEN_RE)) {
    tokens.add(match[1].toLowerCase());
  }
  if (tokens.size === 0) {
    return [];
  }
  const matches: string[] = [];
  for (const key of fieldKeys) {
    const name = key.split('/').at(-1) ?? key;
    // Match the leaf name or the dotted path ("field batching.count is required").
    if (tokens.has(name.toLowerCase()) || tokens.has(key.replaceAll('/', '.').toLowerCase())) {
      matches.push(key);
    }
  }
  return matches;
}

function fieldKeysMentioned(hintText: string, fieldKeys: ReadonlySet<string>): string[] {
  const matches: string[] = [];
  for (const key of fieldKeys) {
    const name = key.split('/').at(-1) ?? key;
    if (name.length < MIN_MENTION_NAME_LENGTH) {
      continue;
    }
    // Lint prose writes field names verbatim or with spaces ("a consumer group is mandatory…").
    const variants = name.includes('_') ? [name, name.replaceAll('_', ' ')] : [name];
    if (variants.some((v) => new RegExp(`\\b${v.replace(ESCAPE_RE, '\\$&')}\\b`, 'i').test(hintText))) {
      matches.push(key);
    }
  }
  return matches;
}

// Segments for the component entry at `target`: its `label` line plus every field of the inner
// config (paths relative to it, matching the form's leaf keys).
function collectFieldSegments(yaml: string, target: EditTarget, componentName: string): FieldSegment[] {
  const segments: FieldSegment[] = [];
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(yaml, { lineCounter });
    const wrapper = doc.getIn(editTargetPath(target), true);
    if (!isMap(wrapper)) {
      return segments;
    }
    for (const pair of wrapper.items) {
      const keyNode = pair.key;
      if (!(isScalar(keyNode) && typeof keyNode.value === 'string' && keyNode.range)) {
        continue;
      }
      if (keyNode.value === 'label') {
        const start = lineCounter.linePos(keyNode.range[0]).line;
        segments.push({ key: 'label', depth: 1, startLine: start, endLine: start });
      } else if (keyNode.value === componentName) {
        walkMapping(pair.value, [], segments, lineCounter);
      }
    }
  } catch {
    // Unparsable YAML: no line anchoring; mention matching below still applies.
  }
  return segments;
}

/** An unanchored hint plus, when its line resolved to a (non-rendered) field, that field's dotted path. */
export type UnmappedLintHint = { hint: LintHint; fieldLabel?: string };

/** Splits a node's lint hints into per-field anchors (only keys the form renders) and the rest. */
export function mapLintHintsToFields(opts: {
  yaml: string;
  target: EditTarget;
  componentName: string;
  hints: readonly LintHint[];
  /** Leaf keys the schema form actually renders (see `formFieldKeys`). */
  fieldKeys: ReadonlySet<string>;
}): { byField: FieldLintErrors; unmapped: UnmappedLintHint[] } {
  const segments = collectFieldSegments(opts.yaml, opts.target, opts.componentName);
  const byField = new Map<string, string[]>();
  const unmapped: UnmappedLintHint[] = [];
  const anchor = (key: string, message: string) => {
    byField.set(key, [...(byField.get(key) ?? []), message]);
  };

  for (const hint of opts.hints) {
    // An explicit "field X …" reference is the strongest signal — it beats the line, which for a
    // MISSING field can only point at the component (whose mapping starts on another field's line).
    const named = fieldKeysNamedExplicitly(hint.hint, opts.fieldKeys);
    if (named.length > 0) {
      for (const key of named) {
        anchor(key, hint.hint);
      }
      continue;
    }
    const lineKey = hint.line > 0 ? fieldKeyForLine(segments, hint.line) : undefined;
    if (lineKey && opts.fieldKeys.has(lineKey)) {
      anchor(lineKey, hint.hint);
      continue;
    }
    const mentioned = fieldKeysMentioned(hint.hint, opts.fieldKeys);
    if (mentioned.length > 0) {
      for (const key of mentioned) {
        anchor(key, hint.hint);
      }
      continue;
    }
    // Not anchorable to a rendered field. If the line at least resolves to a known (complex /
    // unrendered) field, carry its name — a line number is meaningless in the form view.
    unmapped.push({ hint, fieldLabel: lineKey?.replaceAll('/', '.') });
  }
  return { byField, unmapped };
}
