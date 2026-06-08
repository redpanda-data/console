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
import { describe, expect, test } from 'vitest';

import schemaJson from '../../../../../assets/rp-connect-schema-full.json' with { type: 'json' };
import { findComponentByName, resolveFieldByPath } from '../../utils/schema';
import { KNOWN_MISSING_COMPONENTS } from '../known-missing-components';
import { PIPELINE_TEMPLATES } from '../pipeline-templates';

// Regression check against the committed Connect schema snapshot
// (`src/assets/rp-connect-schema-full.json`). A renamed/removed field shows up
// as a failing assertion here instead of silently dropping the schema-driven
// description/required/default for that slot at runtime.
describe('PIPELINE_TEMPLATES schemaField paths resolve against the schema snapshot', () => {
  const componentList = schemaJson as unknown as ComponentList;

  const slotsWithSchemaField = PIPELINE_TEMPLATES.flatMap((t) =>
    t.slots
      .filter((s) => s.schemaField && (s.section === 'source' || s.section === 'sink'))
      .map((s) => {
        const endpoint = s.section === 'source' ? t.source : t.sink;
        return {
          templateId: t.id,
          slotId: s.id,
          schemaField: s.schemaField as string,
          component: endpoint.component,
          type: endpoint.type,
        };
      })
  );

  test.each(slotsWithSchemaField)('$templateId · $slotId → $component.$schemaField', ({
    templateId,
    slotId,
    schemaField,
    component,
    type,
  }) => {
    if (KNOWN_MISSING_COMPONENTS.has(component)) {
      return;
    }
    const comp = findComponentByName(componentList, component, type);
    expect(comp, `template "${templateId}": ${type} "${component}" not in schema snapshot`).toBeDefined();
    const field = resolveFieldByPath(comp?.config, schemaField);
    expect(
      field,
      `template "${templateId}", slot "${slotId}": schemaField "${schemaField}" doesn't resolve on ${type} "${component}"`
    ).toBeDefined();
  });
});
