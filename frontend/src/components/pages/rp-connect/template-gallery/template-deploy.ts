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
import type { ConnectComponentSpec } from '../types/schema';
import { getConnectTemplate } from '../utils/yaml';

export type SlotValues = Record<string, string>;

/**
 * For each slot, return the literal token that we'll substitute into the
 * generated YAML. Secret slots become `${secrets.NAME}`; others use the raw value.
 */
const substituteToken = (slot: TemplateSlot, raw: string): string => {
  if (slot.kind === 'secret') {
    return getSecretSyntax(raw);
  }
  return raw;
};

/**
 * Stitch together a YAML config for a template using the form's slot values.
 *
 * Strategy:
 * 1. If the template provides a hand-curated `baseYaml`, substitute slot placeholders
 *    (`${slot.X}`) in it and return.
 * 2. Otherwise generate a baseline by calling `getConnectTemplate` for the source then
 *    for the sink (so the output is merged on top of the input YAML), then write a
 *    `# template:<id>` header comment so future tooling can spot template-derived configs.
 *
 * For (2) the resulting YAML is a starting point; the user may still need to tweak
 * specific fields the template did not surface as slots. We rely on the gallery's
 * "Open in editor instead" link to give power users an escape hatch.
 */
export const stitchTemplateYaml = ({
  template,
  values,
  components,
}: {
  template: PipelineTemplate;
  values: SlotValues;
  components: ConnectComponentSpec[];
}): string => {
  const slotMap = new Map(template.slots.map((s) => [s.id, s]));

  const substitute = (input: string): string =>
    input.replaceAll(/\$\{slot\.([A-Za-z0-9_-]+)\}/g, (_match, slotId: string) => {
      const slot = slotMap.get(slotId);
      const raw = values[slotId] ?? '';
      if (!slot) {
        return raw;
      }
      return substituteToken(slot, raw);
    });

  if (template.baseYaml) {
    return substitute(template.baseYaml);
  }

  const inputYaml =
    getConnectTemplate({
      connectionName: template.source.component,
      connectionType: template.source.type,
      components,
      showAdvancedFields: false,
    }) ?? '';

  const combinedYaml =
    getConnectTemplate({
      connectionName: template.sink.component,
      connectionType: template.sink.type,
      components,
      showAdvancedFields: false,
      existingYaml: inputYaml,
    }) ?? inputYaml;

  const header = `# Generated from template: ${template.id}\n# ${template.description}\n`;

  return `${header}${substitute(combinedYaml)}`;
};

/**
 * Pre-validates a slot value map against a template. Returns the first missing
 * required slot id, or undefined if every required slot has a non-empty value.
 */
export const findMissingRequiredSlot = (template: PipelineTemplate, values: SlotValues): string | undefined => {
  for (const slot of template.slots) {
    if (slot.required && !values[slot.id]?.trim()) {
      return slot.id;
    }
  }
  return;
};
