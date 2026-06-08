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
  // Labels the generated config and feeds blank-slot fallbacks (TemplateSlot.defaultWhenBlank).
  pipelineName: string;
};

const SLOT_TOKEN_PATTERN = /\$\{slot\.([A-Za-z0-9_-]+)\}/g;

// matchAll avoids the shared-lastIndex hazard of RegExp.test on a global pattern.
const referencedSlotIdsIn = (text: string): string[] => [...text.matchAll(SLOT_TOKEN_PATTERN)].map((m) => m[1]);

const isBlank = (v: string | undefined): boolean => !v?.trim();

const yamlStringifyConfig = { indent: 2, lineWidth: 120 };

/** Resolve a `${slot.X}` reference to its text, or `null` when blank with no fallback (drop the node). */
const resolveSlotToken = (slot: TemplateSlot | undefined, raw: string, pipelineName: string): string | null => {
  if (!isBlank(raw)) {
    return slot?.kind === 'secret' ? getSecretSyntax(raw) : raw;
  }
  const fallback = slot && 'defaultWhenBlank' in slot ? slot.defaultWhenBlank : undefined;
  return fallback ? fallback({ pipelineName }) : null;
};

/** Substitute every slot token in a scalar; `null` if any referenced slot resolves to a drop. */
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
 * Render `baseYaml` with the user's form values via structure-aware substitution:
 * blank optional fields drop their whole key/sequence-item (and any sequence emptied as a result),
 * rather than leaving a dangling key or empty value. Curated comments and layout are preserved.
 */
export const stitchTemplateYaml = ({ template, values, pipelineName }: StitchTemplateArgs): string => {
  const slotMap = new Map(template.slots.map((s) => [s.id, s]));
  const doc = parseDocument(template.baseYaml);

  visit(doc, {
    // Drop the whole pair (not just the scalar) so we never emit `key: null`.
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
      // null here only reaches sequence items (mapping values handled above); dropping keeps the seq well-formed.
      if (resolved === null) {
        return visit.REMOVE;
      }
      if (resolved !== node.value) {
        node.value = resolved;
        // Keep interpolation tokens (${secrets.X}) unquoted; PLAIN still quotes values that truly need it.
        node.type = Scalar.PLAIN;
      }
    },
  });

  // Drop keys whose sequence was emptied above; empty maps are left alone (authored intentionally, e.g. `memory: {}`).
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
