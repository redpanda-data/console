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

import {
  columnFiltersFromSearch,
  facetSearchFromFilters,
  nextPipelineListSearch,
  readPipelineListSearch,
  sortingFromSearch,
  sortSearchFromSorting,
} from './list-search';
import { describe, expect, test } from 'bun:test';

describe('the list search params', () => {
  test('keep only the list keys that parse', () => {
    expect(
      readPipelineListSearch({ tab: 'running', q: 'orders', page: 2, schedule: ['active'], defaultTab: 'x' })
    ).toEqual({ tab: 'running', q: 'orders', page: 2, schedule: ['active'] });
    expect(readPipelineListSearch({ tab: 'nope', page: -1, sort: 'tags', input: 'redpanda' })).toEqual({});
    expect(readPipelineListSearch(undefined)).toEqual({});
  });

  test('become the table’s filters: the tab’s states, the name search and each facet', () => {
    expect(columnFiltersFromSearch({ tab: 'stopped', q: 'night', input: ['redpanda'], runs: ['finite'] })).toEqual([
      { id: 'state', value: expect.any(Array) },
      { id: 'name', value: 'night' },
      { id: 'inputs', value: ['redpanda'] },
      { id: 'end', value: ['finite'] },
    ]);
    // The All tab filters nothing, and a blank search isn't a filter.
    expect(columnFiltersFromSearch({ tab: 'all', q: '  ' })).toEqual([]);
  });

  test('take the facets back from the table, clearing the ones it no longer filters', () => {
    expect(
      facetSearchFromFilters([
        { id: 'state', value: ['1'] },
        { id: 'tags', value: ['env:prod'] },
        { id: 'schedule', value: [] },
      ])
    ).toEqual({ input: undefined, output: undefined, tag: ['env:prod'], runs: undefined, schedule: undefined });
  });

  test('hold a sort only when it isn’t the default', () => {
    expect(sortingFromSearch({})).toEqual([{ id: 'state', desc: false }]);
    expect(sortingFromSearch({ sort: 'schedule' })).toEqual([{ id: 'schedule', desc: false }]);
    expect(sortSearchFromSorting([{ id: 'state', desc: false }])).toEqual({ sort: undefined, desc: undefined });
    expect(sortSearchFromSorting([{ id: 'name', desc: true }])).toEqual({ sort: 'name', desc: true });
    expect(sortSearchFromSorting([])).toEqual({ sort: undefined, desc: undefined });
  });

  test('drop keys left at their default, and keep keys the list doesn’t own', () => {
    expect(
      nextPipelineListSearch({ defaultTab: 'redpanda-connect', q: 'a' }, { q: '', tab: 'all', page: 1, input: [] })
    ).toEqual({ defaultTab: 'redpanda-connect' });
    expect(nextPipelineListSearch({}, { tab: 'error', page: 3 })).toEqual({ tab: 'error', page: 3 });
  });
});
