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
import { isMap, parseDocument } from 'yaml';

import schemaJson from '../../../../../assets/rp-connect-schema-full.json' with { type: 'json' };
import type { RawFieldSpec } from '../../types/schema';
import { checkRequired, findComponentByName, resolveFieldByPath } from '../../utils/schema';
import { KNOWN_MISSING_COMPONENTS } from '../known-missing-components';
import type { PipelineTemplate, TemplateSlot } from '../pipeline-template-types';
import { PIPELINE_TEMPLATES } from '../pipeline-templates';
import { stitchTemplateYaml } from '../template-deploy';

const componentList = schemaJson as unknown as ComponentList;

// The committed snapshot uses raw schema field names (is_optional/default/
// is_advanced/is_deprecated); checkRequired expects the proto FieldSpec names.
// Bridge them so the test reuses the same required-field logic the form uses.
type SnapshotField = {
  is_optional?: boolean;
  default?: string;
  is_advanced?: boolean;
  is_deprecated?: boolean;
  children?: SnapshotField[];
};
const toRawFieldSpec = (f: SnapshotField): RawFieldSpec =>
  ({
    ...f,
    optional: f.is_optional,
    defaultValue: f.default,
    advanced: f.is_advanced,
    deprecated: f.is_deprecated,
    children: f.children?.map(toRawFieldSpec),
  }) as unknown as RawFieldSpec;

// Keys every input/output accepts regardless of component — injected by the
// Connect framework, so they're absent from a component's own field tree.
const FRAMEWORK_KEYS = new Set(['label', 'processors']);

// Fill every slot so nothing is dropped — this validates the maximal field set
// each template can emit.
const sampleValues = (slotIds: string[]): Record<string, string> =>
  Object.fromEntries(slotIds.map((id) => [id, `value_${id}`]));

type FieldNode = { children?: { name: string }[] };

// Walk a stitched mapping and assert every field path exists on the component's
// schema. Recurses into nested maps; sequence items and scalars are leaves here.
function collectUnknownFieldPaths(node: unknown, componentConfig: FieldNode | undefined, prefix: string): string[] {
  if (!isMap(node)) {
    return [];
  }
  const unknown: string[] = [];
  for (const pair of node.items) {
    const key = (pair.key as { value?: unknown } | null)?.value;
    if (typeof key !== 'string') {
      continue;
    }
    if (prefix === '' && FRAMEWORK_KEYS.has(key)) {
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    const field = resolveFieldByPath(componentConfig as never, path);
    if (!field) {
      unknown.push(path);
      continue;
    }
    if (isMap(pair.value) && (field as FieldNode).children) {
      unknown.push(...collectUnknownFieldPaths(pair.value, componentConfig, path));
    }
  }
  return unknown;
}

// Guards "valid outputs after completing the template forms": stitches each
// template with sample values and checks every emitted field resolves against
// the committed Connect schema snapshot. A connector that renames/removes a
// field (the kind of drift that silently broke templates before) fails here
// instead of only surfacing as a server-side lint error after the user submits.
describe('PIPELINE_TEMPLATES produce schema-valid YAML', () => {
  test.each(
    PIPELINE_TEMPLATES.map((t) => ({ id: t.id, template: t }))
  )('$id stitches to YAML with only known component fields', ({ template }) => {
    const yaml = stitchTemplateYaml({
      template,
      values: sampleValues(template.slots.map((s) => s.id)),
      pipelineName: template.defaultPipelineName,
    });

    const doc = parseDocument(yaml);
    expect(doc.errors, `template "${template.id}" stitched to invalid YAML`).toHaveLength(0);

    for (const [yamlKey, type] of [
      ['input', 'input'],
      ['output', 'output'],
    ] as const) {
      const section = doc.get(yamlKey, true);
      if (!isMap(section)) {
        continue;
      }
      for (const pair of section.items) {
        const componentName = (pair.key as { value?: unknown } | null)?.value;
        if (typeof componentName !== 'string' || KNOWN_MISSING_COMPONENTS.has(componentName)) {
          continue;
        }
        const comp = findComponentByName(componentList, componentName, type);
        expect(comp, `template "${template.id}": ${type} "${componentName}" not in schema snapshot`).toBeDefined();

        const unknownPaths = collectUnknownFieldPaths(pair.value, comp?.config as FieldNode | undefined, '');
        expect(
          unknownPaths,
          `template "${template.id}": ${type} "${componentName}" has fields not in schema: ${unknownPaths.join(', ')}`
        ).toEqual([]);
      }
    }
  });

  test('every template stitches without leaving an unresolved slot token', () => {
    for (const template of PIPELINE_TEMPLATES) {
      const yaml = stitchTemplateYaml({
        template,
        values: sampleValues(template.slots.map((s) => s.id)),
        pipelineName: template.defaultPipelineName,
      });
      expect(yaml, `template "${template.id}" left an unsubstituted slot token`).not.toContain('${slot.');
    }
  });

  test('blank optional slots without a fallback are dropped, not left empty', () => {
    const postgres = PIPELINE_TEMPLATES.find((t) => t.id === 'postgres-cdc-to-redpanda');
    expect(postgres).toBeDefined();
    if (!postgres) {
      return;
    }
    // includedTable is optional with no fallback; leaving it blank should drop
    // the whole `tables:` key rather than emit `tables: []` / a blank item.
    const yaml = stitchTemplateYaml({
      template: postgres,
      values: { dsn: 'PG_DSN', slotName: '', includedTable: '', targetTopic: 'orders' },
      pipelineName: 'my-pipeline',
    });
    const doc = parseDocument(yaml);
    expect(doc.errors).toHaveLength(0);
    expect(doc.getIn(['input', 'postgres_cdc', 'tables'])).toBeUndefined();
  });

  // Mirrors applySchemaToSlots: a slot is required if it says so, else the schema
  // decides. Used to fill only what the form would force, leaving everything else
  // blank — the worst case for a connector that needs a field the form treats as
  // optional (the class of bug that produced "field X is required" lint errors).
  const endpointForSection = (template: PipelineTemplate, section: TemplateSlot['section']) => {
    if (section === 'source') {
      return template.source;
    }
    if (section === 'sink') {
      return template.sink;
    }
    return;
  };

  const isSlotRequired = (template: PipelineTemplate, slot: TemplateSlot): boolean => {
    if (slot.required !== undefined) {
      return slot.required;
    }
    if (!slot.schemaField) {
      return false;
    }
    const endpoint = endpointForSection(template, slot.section);
    const comp = endpoint && findComponentByName(componentList, endpoint.component, endpoint.type);
    const field = comp && resolveFieldByPath(comp.config, slot.schemaField);
    return field ? checkRequired(toRawFieldSpec(field as unknown as SnapshotField)) : false;
  };

  // Fill only the form-required slots; blank the rest (slots with defaultWhenBlank
  // still emit a value, so they stay present).
  const minimalValues = (template: PipelineTemplate): Record<string, string> =>
    Object.fromEntries(template.slots.map((s) => [s.id, isSlotRequired(template, s) ? `value_${s.id}` : '']));

  test.each(
    PIPELINE_TEMPLATES.map((t) => ({ id: t.id, template: t }))
  )('$id emits every schema-required field even with optional slots left blank', ({ template }) => {
    const yaml = stitchTemplateYaml({
      template,
      values: minimalValues(template),
      pipelineName: template.defaultPipelineName,
    });
    const doc = parseDocument(yaml);
    expect(doc.errors).toHaveLength(0);

    for (const [yamlKey, type] of [
      ['input', 'input'],
      ['output', 'output'],
    ] as const) {
      const section = doc.get(yamlKey, true);
      if (!isMap(section)) {
        continue;
      }
      for (const pair of section.items) {
        const componentName = (pair.key as { value?: unknown } | null)?.value;
        if (typeof componentName !== 'string' || KNOWN_MISSING_COMPONENTS.has(componentName)) {
          continue;
        }
        const comp = findComponentByName(componentList, componentName, type);
        const present = new Set(
          isMap(pair.value)
            ? pair.value.items
                .map((p) => (p.key as { value?: unknown } | null)?.value)
                .filter((k) => typeof k === 'string')
            : []
        );
        const missing = (comp?.config?.children ?? [])
          .filter((field) => checkRequired(toRawFieldSpec(field as unknown as SnapshotField)))
          .map((field) => (field as { name?: string }).name)
          .filter((name): name is string => !!name && !present.has(name));

        expect(
          missing,
          `template "${template.id}": ${type} "${componentName}" omits required field(s): ${missing.join(', ')}`
        ).toEqual([]);
      }
    }
  });

  test('slot_name falls back to a deterministic name derived from the pipeline', () => {
    const postgres = PIPELINE_TEMPLATES.find((t) => t.id === 'postgres-cdc-to-redpanda');
    expect(postgres).toBeDefined();
    if (!postgres) {
      return;
    }
    const yaml = stitchTemplateYaml({
      template: postgres,
      values: { dsn: 'PG_DSN', slotName: '', includedTable: 'public.users', targetTopic: 'orders' },
      pipelineName: 'My Pipeline 1',
    });
    const doc = parseDocument(yaml);
    // Sanitized to Postgres slot rules ([a-z0-9_]) and prefixed.
    expect(doc.getIn(['input', 'postgres_cdc', 'slot_name'])).toBe('rpcn_my_pipeline_1');
  });
});
