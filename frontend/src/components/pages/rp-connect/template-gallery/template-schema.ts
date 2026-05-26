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

import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import type { PipelineTemplate, TemplateSlot } from './pipeline-template-types';
import type { RawFieldSpec } from '../types/schema';
import { checkRequired, findComponentByName, resolveFieldByPath } from '../utils/schema';

/**
 * Returns the template's slots with any unset `description`, `required`, and
 * `default` filled in from the live component schema. Slot-level values always
 * win; the schema only ever fills blanks. Slots without `schemaField` — or
 * paths that don't resolve — pass through untouched.
 */
export function applySchemaToSlots(template: PipelineTemplate, componentList?: ComponentList): TemplateSlot[] {
  if (!componentList) {
    return template.slots;
  }

  const sourceComp = findComponentByName(componentList, template.source.component);
  const sinkComp = findComponentByName(componentList, template.sink.component);

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

    // Default only applies to kinds that expose one.
    if (
      (merged.kind === 'string' || merged.kind === 'topic' || merged.kind === 'select') &&
      !merged.default &&
      field.defaultValue
    ) {
      return { ...merged, default: field.defaultValue };
    }

    return merged;
  });
}
