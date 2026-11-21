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

import { describe, expect, test } from 'bun:test';
import { isNonEmptyString } from '../../../../../utils/string-utils';
import { componentList } from '../../utils/__fixtures__/schema-snapshot';
import { findComponentByName, resolveFieldByPath } from '../../utils/schema';
import { PIPELINE_TEMPLATES } from '../pipeline-templates';

// Asserts each slot's schemaField resolves against the committed schema snapshot, so a renamed/removed
// field fails here instead of silently dropping that slot's schema-driven description/required/default at runtime.
describe('the PIPELINE_TEMPLATES schemaField paths resolve against the schema snapshot', () => {
  const slotsWithSchemaField = PIPELINE_TEMPLATES.flatMap((template) =>
    template.slots.flatMap((slot) => {
      if (!isNonEmptyString(slot.schemaField) || (slot.section !== 'source' && slot.section !== 'sink')) {
        return [];
      }
      const endpoint = slot.section === 'source' ? template.source : template.sink;
      return [
        {
          templateId: template.id,
          slotId: slot.id,
          schemaField: slot.schemaField,
          component: endpoint.component,
          type: endpoint.type,
        },
      ];
    })
  );

  test.each(slotsWithSchemaField)(
    '$templateId · $slotId → $component.$schemaField',
    ({ templateId, slotId, schemaField, component, type }) => {
      const comp = findComponentByName(componentList, component, type);
      expect(comp, `template "${templateId}": ${type} "${component}" not in schema snapshot`).toBeDefined();
      const field = resolveFieldByPath(comp?.config, schemaField);
      expect(
        field,
        `template "${templateId}", slot "${slotId}": schemaField "${schemaField}" doesn't resolve on ${type} "${component}"`
      ).toBeDefined();
    }
  );
});
