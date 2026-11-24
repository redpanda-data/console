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

import { mapLintHintsToFields } from './lint-field-mapping';
import { describe, expect, test } from 'bun:test';
import type { EditTarget } from '../utils/yaml';

const hint = (line: number, text: string) => ({ line, column: 1, hint: text }) as LintHint;

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
  describe('line anchoring', () => {
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
  });

  describe('message matching', () => {
    test('a component-line hint falls back to every field the message names', () => {
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
      const message = 'field id is required';
      const { byField, unmapped } = run([hint(3, message)]);
      expect(byField.get('id')).toEqual([message]);
      expect(unmapped).toHaveLength(0);
    });

    test('an explicit field reference at the end of a sentence is not swallowed by the period', () => {
      const message = 'this output requires the field topics.';
      const { byField } = run([hint(3, message)]);
      expect(byField.get('topics')).toEqual([message]);
    });
  });

  describe('anchor precedence', () => {
    test('an explicit field reference beats the line anchor', () => {
      const message = 'field seed_brokers is required';
      const { byField } = run([hint(6, message)]); // line 6 is `topics:`
      expect(byField.get('seed_brokers')).toEqual([message]);
      expect(byField.has('topics')).toBe(false);
    });

    test('an explicit field reference beats loose mentions of other fields', () => {
      const message = 'field regexp_topics_include is required when regexp topics are enabled';
      const { byField } = run([hint(3, message)]);
      expect(byField.get('regexp_topics_include')).toEqual([message]);
      expect(byField.has('topics')).toBe(false);
    });
  });

  describe('unmapped and group fallbacks', () => {
    test('hints that anchor to nothing stay unmapped for the banner', () => {
      const { byField, unmapped } = run([hint(3, 'component failed to initialise')]);
      expect(byField.size).toBe(0);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].fieldLabel).toBeUndefined();
    });

    test('an error on a null object anchors to its rendered group section', () => {
      const yamlWithNullGroup = 'input:\n  redpanda:\n    topics: []\n    batching:\n';
      const { byField, unmapped } = mapLintHintsToFields({
        yaml: yamlWithNullGroup,
        target,
        componentName: 'redpanda',
        hints: [hint(4, 'expected object value, got !!null')],
        fieldKeys: new Set(['topics', 'batching']),
      });
      expect(byField.get('batching')).toEqual(['expected object value, got !!null']);
      expect(unmapped).toHaveLength(0);
    });

    test('a line inside an unrendered child anchors up to its group, noting the deeper path', () => {
      const { byField } = mapLintHintsToFields({
        yaml: YAML,
        target,
        componentName: 'redpanda',
        hints: [hint(8, 'expected bool value')], // tls/enabled's line
        fieldKeys: new Set(['tls']), // only the group section is rendered
      });
      expect(byField.get('tls')).toEqual(['expected bool value (enabled)']);
    });

    test('an unmapped hint on an unrendered field carries that field name for the banner', () => {
      const { byField, unmapped } = mapLintHintsToFields({
        yaml: YAML,
        target,
        componentName: 'redpanda',
        hints: [hint(8, 'expected bool value')],
        fieldKeys: new Set(['topics']),
      });
      expect(byField.size).toBe(0);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].fieldLabel).toBe('tls.enabled');
    });
  });
});
