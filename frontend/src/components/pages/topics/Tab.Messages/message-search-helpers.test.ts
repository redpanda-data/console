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
  buildFilterCode,
  buildSearchSignature,
  computeLoadMoreNeed,
  getPageWindow,
  getSearchErrorMessage,
  getVisibleMessages,
  toDisplayError,
} from './message-search-helpers';
import { describe, expect, test } from 'bun:test';
import type { TopicMessage } from '../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../state/ui';

function filter(overrides: Partial<FilterEntry>): FilterEntry {
  return {
    isNew: false,
    id: '1',
    filterType: 'code',
    isActive: true,
    name: '',
    code: 'value.ok',
    transpiledCode: 'value.ok',
    ...overrides,
  };
}

function message(offset: number, timestamp: number, valueJson = ''): TopicMessage {
  return { offset, timestamp, keyJson: '', valueJson } as TopicMessage;
}

describe('getSearchErrorMessage', () => {
  test.each([
    [new Error('broker down'), 'broker down'],
    ['aborted', 'aborted'],
    [new Error(''), 'Unknown error'],
    [undefined, 'Unknown error'],
  ])('describes %p as %p', (error, expected) => {
    expect(getSearchErrorMessage(error)).toBe(expected);
  });

  test('wraps a non-Error rejection in an Error', () => {
    expect(toDisplayError('aborted')).toEqual(new Error('aborted'));
  });
});

describe('buildFilterCode', () => {
  test('returns no program without an active filter', () => {
    expect(buildFilterCode([filter({ isActive: false })])).toEqual({ filterCode: '', functionCount: 0 });
  });

  test('names each active filter and requires all of them', () => {
    const { filterCode, functionCount } = buildFilterCode([
      filter({ transpiledCode: 'return a' }),
      filter({ id: '2', isActive: false }),
      filter({ id: '3', transpiledCode: 'b' }),
    ]);

    expect(functionCount).toBe(2);
    expect(filterCode).toBe(
      [
        `function filter1() {\n${' '.repeat(20)}return a\n${' '.repeat(16)}}`,
        `function filter2() {\n${' '.repeat(20)}return b\n${' '.repeat(16)}}`,
        'return filter1() && filter2()',
      ].join('\n\n')
    );
  });
});

describe('buildSearchSignature', () => {
  test('changes when a filter is toggled', () => {
    const params = {
      startOffset: -1,
      maxResults: 50,
      partitionID: -1,
      startTimestamp: -1,
      keyDeserializer: 0,
      valueDeserializer: 0,
    };

    expect(buildSearchSignature({ ...params, filters: [filter({})] })).toBe('-1 50 -1 -1 0 0 1:true:value.ok');
    expect(buildSearchSignature({ ...params, filters: [filter({ isActive: false })] })).toBe(
      '-1 50 -1 -1 0 0 1:false:value.ok'
    );
  });
});

describe('getVisibleMessages', () => {
  const messages = [message(1, 10, '"created"'), message(2, 30, '"shipped"'), message(3, 20, '"created"')];

  test('keeps the streamed order without a quick search', () => {
    expect(getVisibleMessages(messages, '', false)).toBe(messages);
  });

  test('matches the quick search against offsets and payload JSON', () => {
    expect(getVisibleMessages(messages, 'SHIPPED', false).map((m) => m.offset)).toEqual([2]);
    expect(getVisibleMessages(messages, '3', false).map((m) => m.offset)).toEqual([3]);
  });

  test('orders newest first when asked', () => {
    expect(getVisibleMessages(messages, 'created', true).map((m) => m.offset)).toEqual([3, 1]);
  });
});

describe('getPageWindow', () => {
  test('shows the requested page without continuous pagination', () => {
    expect(
      getPageWindow({
        continuousPaginationEnabled: false,
        pageIndex: 1,
        windowStartPage: 0,
        messageCount: 25,
        pageSize: 10,
        hasNextPage: true,
      })
    ).toEqual({ localPageIndex: 1, loadedPages: 3, hasMoreData: false, boundedLocalPageIndex: 1, tablePageIndex: 1 });
  });

  test('stays on the last loaded page while the next one loads', () => {
    expect(
      getPageWindow({
        continuousPaginationEnabled: true,
        pageIndex: 7,
        windowStartPage: 5,
        messageCount: 20,
        pageSize: 10,
        hasNextPage: true,
      })
    ).toEqual({ localPageIndex: 2, loadedPages: 2, hasMoreData: true, boundedLocalPageIndex: 2, tablePageIndex: 1 });
  });
});

describe('computeLoadMoreNeed', () => {
  const base = { windowStartPage: 0, pageSize: 10, virtualStartIndex: 0 };

  test('loads when the viewed page is not filled yet', () => {
    expect(
      computeLoadMoreNeed({ ...base, pageIndex: 2, loadedCount: 20, lastLoadMore: { pageIndex: 1, total: 20 } })
    ).toEqual({ needsMoreMessages: true, totalVirtualMessages: 20 });
  });

  test('loads ahead on the last loaded page once per page', () => {
    expect(
      computeLoadMoreNeed({ ...base, pageIndex: 1, loadedCount: 20, lastLoadMore: { pageIndex: 0, total: 20 } })
        .needsMoreMessages
    ).toBe(true);
    expect(
      computeLoadMoreNeed({ ...base, pageIndex: 1, loadedCount: 20, lastLoadMore: { pageIndex: 1, total: 20 } })
        .needsMoreMessages
    ).toBe(false);
  });

  test('does not load before the last loaded page', () => {
    expect(
      computeLoadMoreNeed({ ...base, pageIndex: 0, loadedCount: 30, lastLoadMore: { pageIndex: -1, total: -1 } })
        .needsMoreMessages
    ).toBe(false);
  });
});
