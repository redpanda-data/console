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
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';
import { checkRequired, resolveFieldByPath } from '../utils/schema';

// Slot-level values win; schema only fills unset `description` / `required` /
// `default`. Slots without `schemaField` (or with unresolvable paths) pass through.
// Pass enriched specs (enrichComponentsWithConfigSchema) so `required` uses the
// backend-computed signal rather than the proto heuristic.
export function applySchemaToSlots(template: PipelineTemplate, components?: ConnectComponentSpec[]): TemplateSlot[] {
  if (!components?.length) {
    return template.slots;
  }

  const sourceComp = components.find((c) => c.type === template.source.type && c.name === template.source.component);
  const sinkComp = components.find((c) => c.type === template.sink.type && c.name === template.sink.component);

  const componentForSection = (section: TemplateSlot['section']) => {
    if (section === 'source') {
      return sourceComp;
    }
    if (section === 'sink') {
      return sinkComp;
    }
    return;
  };

  return template.slots.map((slot) => {
    if (!slot.schemaField) {
      return slot;
    }
    const comp = componentForSection(slot.section);
    const field = resolveFieldByPath(comp?.config, slot.schemaField);
    if (!field) {
      return slot;
    }

    const merged: TemplateSlot = {
      ...slot,
      description: slot.description ?? (field.description || undefined),
      required: slot.required ?? checkRequired(field as unknown as RawFieldSpec),
    };

    if (merged.kind !== 'secret' && !merged.default && field.defaultValue) {
      return { ...merged, default: field.defaultValue };
    }
    return merged;
  });
}
