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

  test('every template has a non-empty baseYaml', () => {
    for (const t of PIPELINE_TEMPLATES) {
      expect(t.baseYaml.trim().length, `${t.id}.baseYaml`).toBeGreaterThan(0);
    }
  });

  test('every required slot is referenced by a slot token in its baseYaml', () => {
    for (const t of PIPELINE_TEMPLATES) {
      for (const s of t.slots) {
        if (!s.required) {
          continue;
        }
        const token = ['$', '{slot.', s.id, '}'].join('');
        expect(t.baseYaml.includes(token), `${t.id} baseYaml is missing required slot reference for "${s.id}"`).toBe(
          true
        );
      }
    }
  });

  test('every slot token in baseYaml maps to a declared slot', () => {
    const tokenPattern = /\$\{slot\.([A-Za-z0-9_-]+)\}/g;
    for (const t of PIPELINE_TEMPLATES) {
      const slotIds = new Set(t.slots.map((s) => s.id));
      for (const match of t.baseYaml.matchAll(tokenPattern)) {
        expect(slotIds.has(match[1]), `${t.id} references undeclared slot "${match[1]}"`).toBe(true);
      }
    }
  });
});
