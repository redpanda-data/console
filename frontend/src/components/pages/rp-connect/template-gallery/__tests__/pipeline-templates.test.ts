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

import { describe, expect, test } from 'vitest';

import { TEMPLATE_CATEGORY_ORDER } from '../pipeline-template-types';
import { getTemplateById, PIPELINE_TEMPLATES } from '../pipeline-templates';

const COMPONENT_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

describe('PIPELINE_TEMPLATES registry', () => {
  test('contains the v1 PRD set of 16 templates', () => {
    expect(PIPELINE_TEMPLATES).toHaveLength(16);
  });

  test('every template has a unique id', () => {
    const ids = PIPELINE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every template has a category from the registered set', () => {
    for (const t of PIPELINE_TEMPLATES) {
      expect(TEMPLATE_CATEGORY_ORDER).toContain(t.category);
    }
  });

  test('every slot has a unique id within its template', () => {
    for (const t of PIPELINE_TEMPLATES) {
      const slotIds = t.slots.map((s) => s.id);
      expect(new Set(slotIds).size, `duplicate slot id in template ${t.id}`).toBe(slotIds.length);
    }
  });

  test('required slots have non-empty labels', () => {
    for (const t of PIPELINE_TEMPLATES) {
      for (const s of t.slots) {
        if (s.required) {
          expect(s.label.length, `${t.id}.${s.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  test('source and sink reference proto-style component names', () => {
    for (const t of PIPELINE_TEMPLATES) {
      expect(COMPONENT_NAME_PATTERN.test(t.source.component), `${t.id}.source`).toBe(true);
      expect(COMPONENT_NAME_PATTERN.test(t.sink.component), `${t.id}.sink`).toBe(true);
    }
  });

  test('setup time is plausible (1-30 minutes)', () => {
    for (const t of PIPELINE_TEMPLATES) {
      expect(t.setupTimeMinutes).toBeGreaterThanOrEqual(1);
      expect(t.setupTimeMinutes).toBeLessThanOrEqual(30);
    }
  });

  test('getTemplateById returns the matching entry', () => {
    expect(getTemplateById('postgres-cdc-to-redpanda')?.name).toBe('Postgres CDC to Redpanda');
    expect(getTemplateById('does-not-exist')).toBeUndefined();
  });
});
