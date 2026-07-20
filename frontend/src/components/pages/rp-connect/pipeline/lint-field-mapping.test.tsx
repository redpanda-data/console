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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { describe, expect, test } from 'vitest';

import { mapLintHintsToFields } from './lint-field-mapping';
import type { EditTarget } from '../utils/yaml';

const hint = (line: number, text: string) => ({ line, column: 1, hint: text }) as LintHint;

// Line numbers (1-based): 1 input:, 2 label, 3 redpanda:, 4 seed_brokers:, 5 list item,
// 6 topics:, 7 tls:, 8 enabled.
const YAML = `input:
  label: ""
  redpanda:
    seed_brokers:
      - localhost:9092
    topics: []
    tls:
      enabled: true
`;

const target: EditTarget = { kind: 'input' };
const fieldKeys = new Set([
  'label',
  'id',
  'seed_brokers',
  'topics',
  'consumer_group',
  'regexp_topics_include',
  'tls/enabled',
]);

const run = (hints: LintHint[]) =>
  mapLintHintsToFields({ yaml: YAML, target, componentName: 'redpanda', hints, fieldKeys });

describe('mapLintHintsToFields', () => {
  test('anchors a hint to the field whose YAML lines contain it', () => {
    const { byField, unmapped } = run([hint(6, 'expected array value')]);
    expect(byField.get('topics')).toEqual(['expected array value']);
    expect(unmapped).toHaveLength(0);
  });

  test('multi-line values anchor to their field, and nested fields win over their parent', () => {
    const { byField } = run([hint(5, 'bad broker address'), hint(8, 'expected bool value')]);
    expect(byField.get('seed_brokers')).toEqual(['bad broker address']);
    expect(byField.get('tls/enabled')).toEqual(['expected bool value']);
  });

  test('the label line anchors to the label field', () => {
    const { byField } = run([hint(2, 'labels must match the pattern')]);
    expect(byField.get('label')).toEqual(['labels must match the pattern']);
  });

  test('a component-line hint falls back to every field the message names', () => {
    // "line 3" is the `redpanda:` line — no field range contains it, but the message names two fields.
    const message = 'either topics or regexp_topics_include must be specified';
    const { byField, unmapped } = run([hint(3, message)]);
    expect(byField.get('topics')).toEqual([message]);
    expect(byField.get('regexp_topics_include')).toEqual([message]);
    expect(unmapped).toHaveLength(0);
  });

  test('underscored field names match their spaced spelling in lint prose', () => {
    const message = 'a consumer group is mandatory when not using explicit topic partitions';
    const { byField } = run([hint(3, message)]);
    expect(byField.get('consumer_group')).toEqual([message]);
  });

  test('an explicit "field X is required" anchors even to short field names like id', () => {
    // Too short for loose mention matching, but "field id …" is the lint convention — exact.
    const message = 'field id is required';
    const { byField, unmapped } = run([hint(3, message)]);
    expect(byField.get('id')).toEqual([message]);
    expect(unmapped).toHaveLength(0);
  });

  test('an explicit field reference beats the line anchor', () => {
    // A missing-field error's line points at the component's mapping, which STARTS on some other
    // field's line — the named field must win (observed with aws_s3's "field bucket is required"
    // rendering under `path`).
    const message = 'field seed_brokers is required';
    const { byField } = run([hint(6, message)]); // line 6 is `topics:`
    expect(byField.get('seed_brokers')).toEqual([message]);
    expect(byField.has('topics')).toBe(false);
  });

  test('an explicit field reference beats loose mentions of other fields', () => {
    // "topics" appears in the prose, but the error is explicitly about regexp_topics_include.
    const message = 'field regexp_topics_include is required when regexp topics are enabled';
    const { byField } = run([hint(3, message)]);
    expect(byField.get('regexp_topics_include')).toEqual([message]);
    expect(byField.has('topics')).toBe(false);
  });

  test('hints that anchor to nothing stay unmapped for the banner', () => {
    const { byField, unmapped } = run([hint(3, 'component failed to initialise')]);
    expect(byField.size).toBe(0);
    expect(unmapped).toHaveLength(1);
    // Line 3 is the component's own line — no field to name.
    expect(unmapped[0].fieldLabel).toBeUndefined();
  });

  test('an unmapped hint on an unrendered field carries that field name for the banner', () => {
    const { byField, unmapped } = mapLintHintsToFields({
      yaml: YAML,
      target,
      componentName: 'redpanda',
      hints: [hint(8, 'expected bool value')],
      // tls/enabled not rendered by this form.
      fieldKeys: new Set(['topics']),
    });
    expect(byField.size).toBe(0);
    expect(unmapped).toHaveLength(1);
    // The banner shows the field name instead of a line number the form view can't see.
    expect(unmapped[0].fieldLabel).toBe('tls.enabled');
  });
});
