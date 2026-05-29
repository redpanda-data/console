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

import schemaJson from '../../../../../assets/rp-connect-schema-full.json';
import { findComponentByName, resolveFieldByPath } from '../../utils/schema';
import { PIPELINE_TEMPLATES } from '../pipeline-templates';

// Components that templates reference but are missing from the committed
// snapshot — either renamed since capture, enterprise-only, or pending in the
// next snapshot refresh. Listed here so the regression test still flags new
// drift while these known gaps are tracked. Re-capture the snapshot and prune
// this list as components land.
const KNOWN_MISSING_COMPONENTS: ReadonlySet<string> = new Set([
  'aws_dynamodb_stream',
  'oracle_cdc',
  'sql_server_cdc',
  'iceberg',
]);

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

  test.each(slotsWithSchemaField)(
    '$templateId · $slotId → $component.$schemaField',
    ({ templateId, slotId, schemaField, component, type }) => {
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
    }
  );
});
