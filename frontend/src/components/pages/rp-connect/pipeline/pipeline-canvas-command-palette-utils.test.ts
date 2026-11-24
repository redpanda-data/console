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

import { jumpableNodes, searchKeywords, searchValue } from './pipeline-canvas-command-palette-utils';
import { describe, expect, test } from 'bun:test';
import type { PipelineFlowNode } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const ZWSP = '\u200B';
const TARGET = { kind: 'component', section: 'input', path: ['input'] } as unknown as EditTarget;

const node: (overrides: Partial<PipelineFlowNode>) => PipelineFlowNode = (overrides) => ({
  id: 'n',
  kind: 'leaf',
  label: 'node',
  ...overrides,
});

describe('jumpableNodes', () => {
  test('keeps only nodes with both an editTarget and a section', () => {
    const editable = node({ id: 'a', editTarget: TARGET, section: 'input' });
    const structural = node({ id: 'b', section: 'input' }); // no editTarget (e.g. a merge dot)
    const sectionless = node({ id: 'c', editTarget: TARGET }); // no section (e.g. a bare case wrapper)

    expect(jumpableNodes([editable, structural, sectionless])).toEqual([editable]);
  });

  test('returns an empty array when nothing is reachable', () => {
    expect(jumpableNodes([node({ section: 'input' })])).toEqual([]);
  });
});

describe('searchValue', () => {
  test('includes only visible fields — label, labelText, and section — never the id', () => {
    const value = searchValue(
      node({ id: 'secret-id-0', label: 'kafka_franz', labelText: 'my_input', section: 'input' }),
      0
    );

    expect(value.replace(new RegExp(ZWSP, 'gu'), '')).toBe('kafka_franz my_input input');
    expect(value).not.toContain('secret-id-0');
  });

  test('omits absent optional fields', () => {
    expect(searchValue(node({ label: 'drop', section: 'output' }), 0).replace(new RegExp(ZWSP, 'gu'), '')).toBe(
      'drop output'
    );
  });

  test('disambiguates same-named nodes with an index-scaled zero-width suffix', () => {
    const a = searchValue(node({ label: 'kafka' }), 0);
    const b = searchValue(node({ label: 'kafka' }), 1);

    expect(a).not.toBe(b);
    expect(a.replace(new RegExp(ZWSP, 'gu'), '')).toBe(b.replace(new RegExp(ZWSP, 'gu'), ''));
    expect(a.match(new RegExp(ZWSP, 'gu'))).toHaveLength(1);
    expect(b.match(new RegExp(ZWSP, 'gu'))).toHaveLength(2);
  });
});

describe('searchKeywords', () => {
  test('surfaces non-empty meta values', () => {
    const withMeta = node({
      meta: [
        { label: 'topic', value: 'orders' },
        { label: 'group', value: '' },
        { label: 'url', value: 'localhost:9092' },
      ],
    });
    expect(searchKeywords(withMeta)).toEqual(['orders', 'localhost:9092']);
  });

  test('returns undefined when there is no searchable meta', () => {
    expect(searchKeywords(node({}))).toBeUndefined();
    expect(searchKeywords(node({ meta: [{ label: 'group', value: '' }] }))).toBeUndefined();
  });
});
