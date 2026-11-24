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
import { isMap, isScalar, LineCounter, parseDocument, type Scalar, type YAMLMap } from 'yaml';

import { type EditTarget, targetComponentPath } from '../utils/yaml';

/** Field/group key (`path.join('/')`) → the lint messages anchored to it. */
export type FieldLintErrors = ReadonlyMap<string, string[]>;

type FieldSegment = { key: string; depth: number; startLine: number; endLine: number };

type RangedNode = { range?: [number, number, number] | null } | null | undefined;

type RangedStringKey = Scalar<string> & { range: [number, number, number] };

function isRangedStringKey(key: unknown): key is RangedStringKey {
  return isScalar(key) && typeof key.value === 'string' && Boolean(key.range);
}

function pairSegment(keyNode: RangedStringKey, value: unknown, path: string[], lineCounter: LineCounter) {
  const valueRange = (value as RangedNode)?.range;
  // WARNING: Use the value-end offset; a node-end can include trailing blanks and anchor a sibling’s hint to the wrong field.
  const endOffset = valueRange ? valueRange[1] : keyNode.range[1];
  return {
    key: path.join('/'),
    depth: path.length,
    startLine: lineCounter.linePos(keyNode.range[0]).line,
    endLine: lineCounter.linePos(Math.max(endOffset - 1, keyNode.range[0])).line,
  } satisfies FieldSegment;
}

function walkMapping(node: unknown, prefix: string[], out: FieldSegment[], lineCounter: LineCounter) {
  if (!isMap(node)) {
    return;
  }
  for (const pair of node.items) {
    const keyNode = pair.key;
    if (!isRangedStringKey(keyNode)) {
      continue;
    }
    const path = [...prefix, keyNode.value];
    out.push(pairSegment(keyNode, pair.value, path, lineCounter));
    walkMapping(pair.value, path, out, lineCounter);
  }
}

function nearestRenderedAncestor(key: string, fieldKeys: ReadonlySet<string>) {
  const path = key.split('/');
  while (path.length > 0) {
    const candidate = path.join('/');
    if (fieldKeys.has(candidate)) {
      return candidate;
    }
    path.pop();
  }
}

function fieldKeyForLine(segments: readonly FieldSegment[], line: number) {
  let best: FieldSegment | undefined;
  for (const segment of segments) {
    if (line >= segment.startLine && line <= segment.endLine && (!best || segment.depth > best.depth)) {
      best = segment;
    }
  }
  return best?.key;
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/gu;
const MIN_MENTION_NAME_LENGTH = 3;

// WARNING: Do not consume a trailing period as part of a field path; it would miss the field and send its error to the banner.
const FIELD_TOKEN_RE = /\bfield\s+[`'"]?(?<field>[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/giu;

function fieldTokens(hintText: string) {
  const tokens = new Set<string>();
  for (const match of hintText.matchAll(FIELD_TOKEN_RE)) {
    tokens.add(match[1].toLowerCase());
  }
  return tokens;
}

function fieldKeysNamedExplicitly(hintText: string, fieldKeys: ReadonlySet<string>) {
  const tokens = fieldTokens(hintText);
  if (tokens.size === 0) {
    return [];
  }
  const matches: string[] = [];
  for (const key of fieldKeys) {
    const name = key.split('/').at(-1) ?? key;
    if (tokens.has(name.toLowerCase()) || tokens.has(key.replaceAll('/', '.').toLowerCase())) {
      matches.push(key);
    }
  }
  return matches;
}

function fieldKeysMentioned(hintText: string, fieldKeys: ReadonlySet<string>) {
  const matches: string[] = [];
  for (const key of fieldKeys) {
    const name = key.split('/').at(-1) ?? key;
    if (name.length < MIN_MENTION_NAME_LENGTH) {
      continue;
    }
    const variants = name.includes('_') ? [name, name.replaceAll('_', ' ')] : [name];
    if (variants.some((v) => new RegExp(`\\b${v.replace(ESCAPE_RE, '\\$&')}\\b`, 'iu').test(hintText))) {
      matches.push(key);
    }
  }
  return matches;
}

function pushComponentSegments(wrapper: YAMLMap, componentName: string, out: FieldSegment[], lineCounter: LineCounter) {
  for (const pair of wrapper.items) {
    const keyNode = pair.key;
    if (!isRangedStringKey(keyNode)) {
      continue;
    }
    if (keyNode.value === 'label') {
      const start = lineCounter.linePos(keyNode.range[0]).line;
      out.push({ key: 'label', depth: 1, startLine: start, endLine: start });
    } else if (keyNode.value === componentName) {
      walkMapping(pair.value, [], out, lineCounter);
    }
  }
}

function collectFieldSegments(yaml: string, target: EditTarget, componentName: string) {
  const segments: FieldSegment[] = [];
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(yaml, { lineCounter });
    const wrapper = doc.getIn(targetComponentPath(doc, target), true);
    if (isMap(wrapper)) {
      pushComponentSegments(wrapper, componentName, segments, lineCounter);
    }
  } catch {
    // WARNING: Unparsable YAML removes line anchors, not lint hints; field-name matching still applies.
  }
  return segments;
}

/** An unanchored hint plus, when its line resolved to a (non-rendered) field, that field's dotted path. */
export type UnmappedLintHint = { hint: LintHint; fieldLabel?: string };

type ResolvedHint = { anchors: { key: string; message: string }[]; fieldLabel?: string };

function anchoredToKeys(keys: string[], message: string) {
  const hint: ResolvedHint | undefined =
    keys.length > 0 ? { anchors: keys.map((key) => ({ key, message })) } : undefined;
  return hint;
}

function lineAnchoredHint(message: string, lineKey: string, fieldKeys: ReadonlySet<string>) {
  const lineAnchor = nearestRenderedAncestor(lineKey, fieldKeys);
  if (!lineAnchor) {
    return;
  }
  const remainder = lineKey === lineAnchor ? '' : lineKey.slice(lineAnchor.length + 1).replaceAll('/', '.');
  return { anchors: [{ key: lineAnchor, message: remainder ? `${message} (${remainder})` : message }] };
}

function resolveHint(hint: LintHint, segments: readonly FieldSegment[], fieldKeys: ReadonlySet<string>) {
  const named = anchoredToKeys(fieldKeysNamedExplicitly(hint.hint, fieldKeys), hint.hint);
  if (named) {
    return named;
  }
  const lineKey = hint.line > 0 ? fieldKeyForLine(segments, hint.line) : undefined;
  const lineAnchored = lineKey ? lineAnchoredHint(hint.hint, lineKey, fieldKeys) : undefined;
  const resolved: ResolvedHint = lineAnchored ??
    anchoredToKeys(fieldKeysMentioned(hint.hint, fieldKeys), hint.hint) ?? {
      anchors: [],
      fieldLabel: lineKey?.replaceAll('/', '.'),
    };
  return resolved;
}

function appendFieldMessages(byField: Map<string, string[]>, anchors: ResolvedHint['anchors']) {
  for (const { key, message } of anchors) {
    byField.set(key, [...(byField.get(key) ?? []), message]);
  }
}

/**
 * Anchors a node's lint hints to the inspector form fields they belong to, so an error renders
 * under the field (or inside the group section) it's about instead of as "(line 12)" in a banner
 * the user has to decode. Splits into per-field anchors (only keys the form renders) and the
 * rest for the banner. See `resolveHint` for the anchoring tiers.
 *
 * Explicit field references take priority over a line alone: a missing field does not have a source line. Then try the deepest segment and its nearest rendered ancestor, and finally loose prose mentions.
 *
 * Short names need an explicit reference; otherwise prose can contain unrelated words such as id. The banner retains unanchored errors and a field label when known.
 */
export function mapLintHintsToFields(opts: {
  yaml: string;
  target: EditTarget;
  componentName: string;
  hints: readonly LintHint[];
  /** Keys the schema form actually renders — leaves and group sections (see `formFieldKeys`). */
  fieldKeys: ReadonlySet<string>;
}) {
  const segments = collectFieldSegments(opts.yaml, opts.target, opts.componentName);
  const byField = new Map<string, string[]>();
  const unmapped: UnmappedLintHint[] = [];

  for (const hint of opts.hints) {
    const resolved = resolveHint(hint, segments, opts.fieldKeys);
    if (resolved.anchors.length === 0) {
      unmapped.push({ hint, fieldLabel: resolved.fieldLabel });
    } else {
      appendFieldMessages(byField, resolved.anchors);
    }
  }
  const fieldHints: { byField: FieldLintErrors; unmapped: UnmappedLintHint[] } = { byField, unmapped };
  return fieldHints;
}
