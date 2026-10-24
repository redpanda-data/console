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

import type { TopicMessage } from '../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../state/ui';
import { wrapFilterFragment } from '../../../../utils/filter-helper';

// A rejection during a search that's being torn down by navigation isn't guaranteed to be a
// proper Error, so never assume `.message` exists on it.
export function getSearchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Unknown error';
}

export function toDisplayError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getSearchErrorMessage(error));
}

/**
 * Combines the active JavaScript filters into one filter program: each filter becomes a named
 * function, and the program returns whether all of them accept the message.
 */
export function buildFilterCode(filters: FilterEntry[]): { filterCode: string; functionCount: number } {
  const activeFilters = filters.filter(
    (searchParam) => searchParam.isActive && searchParam.code && searchParam.transpiledCode
  );
  if (activeFilters.length === 0) {
    return { filterCode: '', functionCount: 0 };
  }

  const functionNames = activeFilters.map((_, index) => `filter${index + 1}`);
  const functions = activeFilters.map(
    (searchParam, index) => `function ${functionNames[index]}() {
                    ${wrapFilterFragment(searchParam.transpiledCode)}
                }`
  );
  const calls = functionNames.map((f) => `${f}()`).join(' && ');

  return { filterCode: `${functions.join('\n\n')}\n\nreturn ${calls}`, functionCount: functions.length };
}

/** Identifies a search by everything that changes its results, so an identical auto search can be skipped. */
export function buildSearchSignature(params: {
  startOffset: number;
  maxResults: number;
  partitionID: number;
  startTimestamp: number;
  keyDeserializer: number;
  valueDeserializer: number;
  filters: FilterEntry[];
}): string {
  const { startOffset, maxResults, partitionID, startTimestamp, keyDeserializer, valueDeserializer, filters } = params;
  // Includes filters to detect changes
  const filtersSignature = filters.map((f) => `${f.id}:${f.isActive}:${f.transpiledCode}`).join('|');
  return `${startOffset} ${maxResults} ${partitionID} ${startTimestamp} ${keyDeserializer} ${valueDeserializer} ${filtersSignature}`;
}

function matchesQuickSearch(message: TopicMessage, quickSearch: string): boolean | undefined {
  const searchStr = quickSearch.toLowerCase();
  return (
    message.offset.toString().toLowerCase().includes(searchStr) ||
    message.keyJson?.toLowerCase().includes(searchStr) ||
    message.valueJson?.toLowerCase().includes(searchStr)
  );
}

/**
 * The messages the table shows: those matching the quick search, newest first when `newestFirst`.
 *
 * Continuous pagination disables header sorting, so the table's sorted row model can't impose
 * newest-first there; the caller forces it for the "Newest" fetch only (timestamp desc, then offset
 * desc as a cross-partition tiebreak). Otherwise the streamed order is kept and the table sorts.
 */
export function getVisibleMessages(messages: TopicMessage[], quickSearch: string, newestFirst: boolean) {
  const matching = quickSearch ? messages.filter((m) => matchesQuickSearch(m, quickSearch)) : messages;
  return newestFirst ? [...matching].sort((a, b) => b.timestamp - a.timestamp || b.offset - a.offset) : matching;
}

/**
 * Where the table is in the sliding window of loaded pages. In continuous pagination the global
 * `pageIndex` maps to a window-local page; `windowStartPage` is the global number of the first page
 * in memory. A page past the loaded ones exists while the backend has more data.
 */
export function getPageWindow(params: {
  continuousPaginationEnabled: boolean;
  pageIndex: number;
  windowStartPage: number;
  messageCount: number;
  pageSize: number;
  hasNextPage: boolean;
}) {
  const { continuousPaginationEnabled, pageIndex, windowStartPage, messageCount, pageSize, hasNextPage } = params;
  const localPageIndex = continuousPaginationEnabled ? Math.max(0, pageIndex - windowStartPage) : pageIndex;
  const loadedPages = Math.ceil(messageCount / pageSize);
  const hasMoreData = continuousPaginationEnabled && hasNextPage;
  const totalPages = Math.max(1, hasMoreData ? loadedPages + 1 : loadedPages);
  const boundedLocalPageIndex = Math.min(localPageIndex, totalPages - 1);
  const isOnUnloadedPage = boundedLocalPageIndex >= loadedPages && hasMoreData;

  return {
    localPageIndex,
    loadedPages,
    hasMoreData,
    boundedLocalPageIndex,
    tablePageIndex: isOnUnloadedPage ? loadedPages - 1 : boundedLocalPageIndex,
  };
}

/**
 * Whether continuous pagination has to fetch another page for the page being viewed: either the
 * page isn't filled yet, or it is the last loaded page and the last fetch was for another page or
 * fewer messages.
 */
export function computeLoadMoreNeed(params: {
  pageIndex: number;
  windowStartPage: number;
  pageSize: number;
  loadedCount: number;
  virtualStartIndex: number;
  lastLoadMore: { pageIndex: number; total: number };
}) {
  const { pageIndex, windowStartPage, pageSize, loadedCount, virtualStartIndex, lastLoadMore } = params;
  // Compute window-local page position; lastLoadMore uses the global pageIndex to deduplicate across window shifts
  const localPage = Math.max(0, pageIndex - windowStartPage);
  const totalLoadedPages = Math.ceil(loadedCount / pageSize);
  const isOnLastPage = localPage === totalLoadedPages - 1;
  const totalVirtualMessages = virtualStartIndex + loadedCount;
  const needsMoreForCurrentPage = (localPage + 1) * pageSize > loadedCount;
  const isNewPageOrTotalChanged = lastLoadMore.pageIndex !== pageIndex || lastLoadMore.total < totalVirtualMessages;

  return {
    needsMoreMessages: needsMoreForCurrentPage || (isOnLastPage && isNewPageOrTotalChanged),
    totalVirtualMessages,
  };
}
