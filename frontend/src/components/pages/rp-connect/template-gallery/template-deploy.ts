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

import type { PipelineTemplate, TemplateSlot } from './pipeline-template-types';
import { getSecretSyntax } from '../types/constants';

export type SlotValues = Record<string, string>;

// Secret slots become `${secrets.NAME}`; everything else inlines as-is.
const substituteToken = (slot: TemplateSlot, raw: string): string => {
  if (slot.kind === 'secret') {
    return getSecretSyntax(raw);
  }
  return raw;
};

const SLOT_TOKEN_PATTERN = /\$\{slot\.([A-Za-z0-9_-]+)\}/g;

export const stitchTemplateYaml = ({
  template,
  values,
}: {
  template: PipelineTemplate;
  values: SlotValues;
}): string => {
  const slotMap = new Map(template.slots.map((s) => [s.id, s]));

  const substituted = template.baseYaml.replaceAll(SLOT_TOKEN_PATTERN, (_match, slotId: string) => {
    const slot = slotMap.get(slotId);
    const raw = values[slotId] ?? '';
    if (!slot) {
      return raw;
    }
    return substituteToken(slot, raw);
  });

  const header = `# Generated from template: ${template.id}\n# ${template.description}\n`;
  return `${header}${substituted}`;
};

// Returns the id of the first required slot without a value, or undefined.
export const findMissingRequiredSlot = (template: PipelineTemplate, values: SlotValues): string | undefined => {
  for (const slot of template.slots) {
    if (slot.required && !values[slot.id]?.trim()) {
      return slot.id;
    }
  }
  return;
};
