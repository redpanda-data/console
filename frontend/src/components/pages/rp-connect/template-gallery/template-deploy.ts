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

import { isScalar, isSeq, parseDocument, Scalar, visit, stringify as yamlStringify } from 'yaml';

import type { PipelineTemplate, TemplateSlot } from './pipeline-template-types';
import { getSecretSyntax } from '../types/constants';

export type SlotValues = Record<string, string>;

export type StitchTemplateArgs = {
  template: PipelineTemplate;
  values: SlotValues;
  // Used both to label the generated config and to derive blank-slot fallbacks
  // (see TemplateSlot.defaultWhenBlank).
  pipelineName: string;
};

const SLOT_TOKEN_PATTERN = /\$\{slot\.([A-Za-z0-9_-]+)\}/g;

// matchAll builds a fresh iterator each call, so there's no shared-lastIndex
// hazard (unlike RegExp.test on a global pattern).
const referencedSlotIdsIn = (text: string): string[] => [...text.matchAll(SLOT_TOKEN_PATTERN)].map((m) => m[1]);

const isBlank = (v: string | undefined): boolean => !v?.trim();

const yamlStringifyConfig = { indent: 2, lineWidth: 120 };

/**
 * Resolve a single `${slot.X}` reference to the text it should emit, or `null`
 * when the slot is blank and has no fallback — signalling the caller to drop the
 * surrounding node so the connector falls back to its own default.
 */
const resolveSlotToken = (slot: TemplateSlot | undefined, raw: string, pipelineName: string): string | null => {
  if (!isBlank(raw)) {
    return slot?.kind === 'secret' ? getSecretSyntax(raw) : raw;
  }
  const fallback = slot && 'defaultWhenBlank' in slot ? slot.defaultWhenBlank : undefined;
  return fallback ? fallback({ pipelineName }) : null;
};

/**
 * Substitute every slot token in a scalar string. Returns `null` if any
 * referenced slot resolves to a drop (blank, no fallback), else the substituted
 * text (unchanged when it contains no tokens).
 */
const substituteScalar = (
  text: string,
  slotMap: Map<string, TemplateSlot>,
  values: SlotValues,
  pipelineName: string
): string | null => {
  const ids = referencedSlotIdsIn(text);
  if (ids.length === 0) {
    return text;
  }
  const resolved = new Map<string, string>();
  for (const id of ids) {
    const value = resolveSlotToken(slotMap.get(id), values[id] ?? '', pipelineName);
    if (value === null) {
      return null;
    }
    resolved.set(id, value);
  }
  return text.replaceAll(SLOT_TOKEN_PATTERN, (_match, id: string) => resolved.get(id) ?? '');
};

/**
 * Render a template's `baseYaml` with the user's form values. Parses the YAML so
 * substitution is structure-aware: blank optional fields drop their whole key
 * (or sequence item) rather than leaving a dangling `key:`/empty value, and a
 * sequence/map emptied by those drops is removed too. Comments and layout from
 * the curated template are preserved.
 */
export const stitchTemplateYaml = ({ template, values, pipelineName }: StitchTemplateArgs): string => {
  const slotMap = new Map(template.slots.map((s) => [s.id, s]));
  const doc = parseDocument(template.baseYaml);

  visit(doc, {
    // A mapping value that resolves to a drop removes the whole pair, so we never
    // emit `key: null`. (Removing just the scalar would leave the key behind.)
    Pair(_, pair) {
      if (
        isScalar(pair.value) &&
        typeof pair.value.value === 'string' &&
        substituteScalar(pair.value.value, slotMap, values, pipelineName) === null
      ) {
        return visit.REMOVE;
      }
    },
    Scalar(_, node) {
      if (typeof node.value !== 'string') {
        return;
      }
      const resolved = substituteScalar(node.value, slotMap, values, pipelineName);
      // null here only reaches sequence items (mapping values are handled above);
      // dropping the item keeps the sequence well-formed.
      if (resolved === null) {
        return visit.REMOVE;
      }
      if (resolved !== node.value) {
        node.value = resolved;
        // Keep interpolation tokens (${secrets.X}) unquoted; the serializer still
        // quotes values that genuinely need it even with an explicit PLAIN type.
        node.type = Scalar.PLAIN;
      }
    },
  });

  // Drop keys whose sequence was emptied by the removals above (e.g. a `tables:`
  // list whose only templated item was blank). Empty maps are left alone — those
  // are authored intentionally (e.g. `scanner: { lines: {} }`, `memory: {}`).
  visit(doc, {
    Pair(_, pair) {
      if (isSeq(pair.value) && pair.value.items.length === 0) {
        return visit.REMOVE;
      }
    },
  });

  doc.commentBefore = ` Generated from template: ${template.id}\n ${template.description}`;
  return yamlStringify(doc, yamlStringifyConfig);
};
