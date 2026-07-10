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

import { jumpableNodes, SECTION_LABEL, searchKeywords, searchValue } from './pipeline-canvas-command-palette-utils';
import type { PipelineFlowNode } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const ZWSP = '\u200B';
const TARGET = { kind: 'component', section: 'input', path: ['input'] } as unknown as EditTarget;

const node = (overrides: Partial<PipelineFlowNode>): PipelineFlowNode => ({
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

    expect(value.replace(new RegExp(ZWSP, 'g'), '')).toBe('kafka_franz my_input input');
    expect(value).not.toContain('secret-id-0');
  });

  test('omits absent optional fields', () => {
    expect(searchValue(node({ label: 'drop', section: 'output' }), 0).replace(new RegExp(ZWSP, 'g'), '')).toBe(
      'drop output'
    );
  });

  test('disambiguates same-named nodes with an index-scaled zero-width suffix', () => {
    const a = searchValue(node({ label: 'kafka' }), 0);
    const b = searchValue(node({ label: 'kafka' }), 1);

    // Distinct values so cmdk can track each row separately...
    expect(a).not.toBe(b);
    // ...but identical once the invisible suffix is stripped.
    expect(a.replace(new RegExp(ZWSP, 'g'), '')).toBe(b.replace(new RegExp(ZWSP, 'g'), ''));
    // Suffix length is index-derived (index + 1 zero-width spaces).
    expect(a.match(new RegExp(ZWSP, 'g'))).toHaveLength(1);
    expect(b.match(new RegExp(ZWSP, 'g'))).toHaveLength(2);
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

describe('SECTION_LABEL', () => {
  test('maps every section to a human label', () => {
    expect(SECTION_LABEL).toEqual({
      input: 'Input',
      processor: 'Processor',
      output: 'Output',
      resource: 'Resource',
    });
  });
});
