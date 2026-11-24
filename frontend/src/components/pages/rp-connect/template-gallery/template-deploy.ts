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
  pipelineName: string;
};

const SLOT_TOKEN_PATTERN = /\$\{slot\.(?<slotId>[A-Za-z0-9_-]+)\}/gu;
const EXACT_SLOT_TOKEN_PATTERN = /^\$\{slot\.(?<slotId>[A-Za-z0-9_-]+)\}$/u;

// WARNING: Use matchAll with the global token pattern; test advances lastIndex and makes later slot checks depend on earlier ones.
const referencedSlotIdsIn = (text: string) => [...text.matchAll(SLOT_TOKEN_PATTERN)].map((m) => m[1]);

const isBlank = (v: string | undefined) => !v?.trim();

const splitListValue = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const yamlStringifyConfig = { indent: 2, lineWidth: 120 };

const resolveSlotToken = (slot: TemplateSlot | undefined, raw: string, pipelineName: string) => {
  if (!isBlank(raw)) {
    return slot?.kind === 'secret' ? getSecretSyntax(raw) : raw;
  }
  const fallback = slot && 'defaultWhenBlank' in slot ? slot.defaultWhenBlank : undefined;
  return fallback ? fallback({ pipelineName }) : null;
};

const substituteScalar = (
  text: string,
  slotMap: Map<string, TemplateSlot>,
  values: SlotValues,
  pipelineName: string
) => {
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

const listSlotItemId = (item: unknown, slotMap: Map<string, TemplateSlot>) => {
  const tokenId =
    isScalar(item) && typeof item.value === 'string' ? item.value.match(EXACT_SLOT_TOKEN_PATTERN)?.[1] : undefined;
  const slot = tokenId ? slotMap.get(tokenId) : undefined;
  return slot?.kind === 'string' && slot.list ? tokenId : undefined;
};

const listSlotEntries: (slot: TemplateSlot | undefined, raw: string, pipelineName: string) => Scalar[] = (
  slot,
  raw,
  pipelineName
) => {
  const resolved = resolveSlotToken(slot, raw, pipelineName);
  return resolved === null ? [] : splitListValue(resolved).map((entry) => new Scalar(entry));
};

const expandListSlotItems = (
  items: unknown[],
  slotMap: Map<string, TemplateSlot>,
  values: SlotValues,
  pipelineName: string
) => {
  let changed = false;
  const expanded: unknown[] = [];
  for (const item of items) {
    const tokenId = listSlotItemId(item, slotMap);
    if (tokenId === undefined) {
      expanded.push(item);
    } else {
      changed = true;
      expanded.push(...listSlotEntries(slotMap.get(tokenId), values[tokenId] ?? '', pipelineName));
    }
  }
  return changed ? expanded : null;
};

/**
 * Render `baseYaml` with the user's form values via structure-aware substitution:
 * blank optional fields drop their whole key/sequence-item (and any sequence emptied as a result),
 * rather than leaving a dangling key or empty value. Curated comments and layout are preserved.
 *
 * An exact list-slot item expands before the scalar pass; a slot inside longer text stays inline. An empty list drops its pair, but an authored empty map such as memory: {} is retained. The serializer quotes entries that would otherwise parse as another scalar type.
 */
export const stitchTemplateYaml = ({ template, values, pipelineName }: StitchTemplateArgs) => {
  const slotMap = new Map(template.slots.map((s) => [s.id, s]));
  const doc = parseDocument(template.baseYaml);

  visit(doc, {
    Pair(_, pair) {
      if (
        isScalar(pair.value) &&
        typeof pair.value.value === 'string' &&
        substituteScalar(pair.value.value, slotMap, values, pipelineName) === null
      ) {
        return visit.REMOVE;
      }
    },
    Seq(_, seq) {
      const expanded = expandListSlotItems(seq.items, slotMap, values, pipelineName);
      if (expanded) {
        seq.items = expanded;
      }
    },
    Scalar(_, node) {
      if (typeof node.value !== 'string') {
        return;
      }
      const resolved = substituteScalar(node.value, slotMap, values, pipelineName);
      if (resolved === null) {
        return visit.REMOVE;
      }
      if (resolved !== node.value) {
        node.value = resolved;
        // WARNING: Keep interpolation tokens plain; quoting them here would change the curated template representation.
        node.type = Scalar.PLAIN;
      }
    },
  });

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
