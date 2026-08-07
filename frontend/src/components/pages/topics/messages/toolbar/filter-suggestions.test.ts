/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { buildSuggestions, computeGhost, type SuggestionsInput } from './filter-suggestions';
import type { TopicMessage } from '../../../../../state/rest-interfaces';

const makeMsg = (partitionID: number, offset: number, value: unknown): TopicMessage =>
  ({
    partitionID,
    offset,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: `key-${offset}`, isPayloadNull: false, size: 1 },
    value: { payload: value, isPayloadNull: false, size: 1 },
    keyJson: `"key-${offset}"`,
    valueJson: JSON.stringify(value),
    keyBinHexPreview: '',
    valueBinHexPreview: '',
  }) as TopicMessage;

const messages = [
  makeMsg(0, 1, { type: 'INVOICE', address: { city: 'Berlin' } }),
  makeMsg(0, 2, { type: 'ORDER', address: { city: 'Paris' } }),
  makeMsg(1, 3, { type: 'INVOICE', address: { city: 'Berlin' } }),
];

const input = (overrides: Partial<SuggestionsInput>): SuggestionsInput => ({
  query: '',
  pendingField: null,
  messages,
  recents: [],
  canUseJsFilters: true,
  ...overrides,
});

const itemLabels = (result: ReturnType<typeof buildSuggestions>) =>
  result.items.filter((i) => i.kind === 'item').map((i) => i.label);

describe('buildSuggestions', () => {
  test('default view groups filters and fields', () => {
    const result = buildSuggestions(input({}));
    expect(itemLabels(result)).toEqual(['partition:', 'js:', 'value:', 'key:', 'offset:']);
  });

  test('recents appear first when present', () => {
    const result = buildSuggestions(
      input({
        recents: [{ label: 'partition:1', action: { type: 'commit-field', field: 'partition', op: 'eq', value: '1' } }],
      })
    );
    expect(itemLabels(result)[0]).toBe('partition:1');
  });

  test('js suggestions are hidden without the permission', () => {
    const result = buildSuggestions(input({ canUseJsFilters: false }));
    expect(itemLabels(result)).not.toContain('js:');
  });

  test('pending partition lists distinct values with counts', () => {
    const result = buildSuggestions(input({ pendingField: 'partition' }));
    expect(result.heading).toBe('Value for Partition');
    const items = result.items.filter((i) => i.kind === 'item');
    expect(items[0]).toMatchObject({ label: '0', sub: '2 msgs' });
    expect(items[1]).toMatchObject({ label: '1', sub: '1 msg' });
  });

  test('pending offset with typed value offers comparisons', () => {
    const result = buildSuggestions(input({ pendingField: 'offset', query: '2' }));
    expect(itemLabels(result)).toEqual(['offset > 2', 'offset < 2', 'offset = 2']);
  });

  test('value path traversal suggests nested fields', () => {
    const result = buildSuggestions(input({ query: 'value.add' }));
    expect(itemLabels(result)).toContain('value.address');
    expect(itemLabels(result)).toContain('value.address.city');
  });

  test('js: prefix routes to the editor', () => {
    const result = buildSuggestions(input({ query: 'js: value.type === "ORDER"' }));
    expect(result.heading).toBe('JavaScript');
    const item = result.items.find((i) => i.kind === 'item');
    expect(item?.action).toEqual({ type: 'open-js', code: 'value.type === "ORDER"' });
  });

  test('typing a bare field: lists its possible values like pending mode', () => {
    const result = buildSuggestions(input({ query: 'partition:' }));
    expect(result.heading).toBe('Value for Partition');
    const items = result.items.filter((i) => i.kind === 'item');
    expect(items[0]).toMatchObject({ label: '0', sub: '2 msgs' });
    expect(items[1]).toMatchObject({ label: '1', sub: '1 msg' });

    const keyResult = buildSuggestions(input({ query: 'key:' }));
    expect(keyResult.heading).toBe('Value for key');
    expect(itemLabels(keyResult).length).toBeGreaterThan(0);
  });

  test('typing a bare nested value.<path>: also lists its possible values', () => {
    const result = buildSuggestions(input({ query: 'value.type:' }));
    expect(result.heading).toBe('Value for value.type');
    const items = result.items.filter((i) => i.kind === 'item');
    expect(items[0]).toMatchObject({ label: 'INVOICE', sub: '2 msgs' });
    expect(items[1]).toMatchObject({ label: 'ORDER', sub: '1 msg' });
  });

  test('bare value: is left as a free-text prefix, not an enumerable field', () => {
    const result = buildSuggestions(input({ query: 'value:' }));
    expect(result.heading).not.toBe('Value for value');
  });

  test('typed field token shows the parsed filter with match count', () => {
    const result = buildSuggestions(input({ query: 'partition:1' }));
    const item = result.items.find((i) => i.kind === 'item');
    expect(item).toMatchObject({ label: 'partition:1', sub: '1 msg' });
    expect(item?.kind === 'item' && item.action).toEqual({
      type: 'commit-field',
      field: 'partition',
      op: 'eq',
      value: '1',
    });
  });
});

describe('computeGhost', () => {
  test('completes field names with a trailing colon', () => {
    const ghost = computeGhost(input({ query: 'par' }));
    expect(ghost?.rest).toBe('tition:');
    expect(ghost?.action).toEqual({ type: 'set-pending', field: 'partition' });
  });

  test('completes pending values toward the most common match', () => {
    const ghost = computeGhost(input({ pendingField: 'value.type', query: 'INV' }));
    expect(ghost?.rest).toBe('OICE');
  });

  test('returns null when nothing completes', () => {
    expect(computeGhost(input({ query: 'zzz' }))).toBeNull();
    expect(computeGhost(input({ query: '' }))).toBeNull();
  });
});
