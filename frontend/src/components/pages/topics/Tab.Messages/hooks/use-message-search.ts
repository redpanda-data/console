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

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { MessagePagingParams, MessageQueryParams } from './use-message-view-params';
import { isServerless } from '../../../../../config';
import { appGlobal } from '../../../../../state/app-global';
import { api, createMessageSearch, type MessageSearchRequest } from '../../../../../state/backend-api';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../../state/ui';
import { IsDev } from '../../../../../utils/env';
import { sanitizeString } from '../../../../../utils/filter-helper';
import { trimSlidingWindow } from '../../../../../utils/message-table-helpers';
import { encodeBase64 } from '../../../../../utils/utils';
import {
  buildFilterCode,
  buildSearchSignature,
  computeLoadMoreNeed,
  getSearchErrorMessage,
  toDisplayError,
} from '../message-search-helpers';

export type MessageSearch = ReturnType<typeof createMessageSearch>;

// Combined search & pagination state to avoid cascading setState calls
export type SearchState = {
  messages: TopicMessage[];
  messageSearch: MessageSearch | null;
  totalLoadedCount: number;
  virtualStartIndex: number;
  windowStartPage: number;
  loadMoreFailures: number;
  forceRefresh: number;
  loadMorePhase: 'idle' | 'loading' | 'loading-visible';
};

export type SetSearchState = React.Dispatch<React.SetStateAction<SearchState>>;

const INITIAL_SEARCH_STATE: SearchState = {
  messages: [],
  messageSearch: null,
  totalLoadedCount: 0,
  virtualStartIndex: 0,
  windowStartPage: 0,
  loadMoreFailures: 0,
  forceRefresh: 0,
  loadMorePhase: 'idle',
};

const MAX_LOAD_MORE_RETRIES = 3;

type LastLoadMore = { pageIndex: number; total: number };

function useSearchProgress() {
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const [bytesConsumed, setBytesConsumed] = useState(0);
  const [totalMessagesConsumed, setTotalMessagesConsumed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  return {
    fetchError,
    setFetchError,
    searchPhase,
    setSearchPhase,
    bytesConsumed,
    setBytesConsumed,
    totalMessagesConsumed,
    setTotalMessagesConsumed,
    elapsedMs,
    setElapsedMs,
  };
}

type SearchProgress = ReturnType<typeof useSearchProgress>;

// Refs avoid stale closures in effects and callbacks that outlive a render.
function useSlidingWindowRefs(pageIndex: number) {
  const virtualStartIndexRef = useRef(0);
  // Sliding window: the global page number of the first page currently in memory
  const windowStartPageRef = useRef(0);
  const prevPageIndexRef = useRef<number>(pageIndex);
  const lastLoadMoreRef = useRef<LastLoadMore>({ pageIndex: -1, total: -1 });
  const pageIndexRef = useRef(pageIndex);

  return { virtualStartIndexRef, windowStartPageRef, prevPageIndexRef, lastLoadMoreRef, pageIndexRef };
}

function useSearchRunRefs() {
  const currentSearchRunRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageSearchRef = useRef<MessageSearch | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  return { currentSearchRunRef, abortControllerRef, currentMessageSearchRef, loadMoreAbortRef, isMountedRef };
}

function useSearchRefs(pageIndex: number) {
  const windowRefs = useSlidingWindowRefs(pageIndex);
  const runRefs = useSearchRunRefs();
  return { ...windowRefs, ...runRefs };
}

type SearchRefs = ReturnType<typeof useSearchRefs>;

// The "loading more" indicator only shows once a load takes longer than a second.
function useLoadingIndicatorDelay(loadMorePhase: SearchState['loadMorePhase'], setSearchState: SetSearchState) {
  useEffect(() => {
    if (loadMorePhase !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setSearchState((prev) => ({ ...prev, loadMorePhase: 'loading-visible' })), 1000);
    return () => clearTimeout(timer);
  }, [loadMorePhase, setSearchState]);
}

function useSearchRefSync(searchState: SearchState, pageIndex: number, refs: SearchRefs) {
  const { messageSearch, virtualStartIndex, windowStartPage } = searchState;
  const { currentMessageSearchRef, virtualStartIndexRef, windowStartPageRef, pageIndexRef } = refs;
  const { isMountedRef, abortControllerRef, loadMoreAbortRef } = refs;

  // Keep currentMessageSearchRef in sync with messageSearch state
  useEffect(() => {
    currentMessageSearchRef.current = messageSearch;
  }, [messageSearch, currentMessageSearchRef]);

  // Keep virtualStartIndexRef in sync
  useEffect(() => {
    virtualStartIndexRef.current = virtualStartIndex;
  }, [virtualStartIndex, virtualStartIndexRef]);

  // Keep windowStartPageRef in sync
  useEffect(() => {
    windowStartPageRef.current = windowStartPage;
  }, [windowStartPage, windowStartPageRef]);

  // Keep pageIndexRef in sync
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex, pageIndexRef]);

  // Cleanup effect (replaces componentWillUnmount)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (loadMoreAbortRef.current) {
        loadMoreAbortRef.current.abort();
      }
      appGlobal.searchMessagesFunc = undefined;
    };
  }, [isMountedRef, abortControllerRef, loadMoreAbortRef]);
}

type SearchRequestParams = Pick<
  MessageQueryParams,
  | 'partitionID'
  | 'startOffset'
  | 'startTimestamp'
  | 'maxResults'
  | 'keyDeserializer'
  | 'valueDeserializer'
  | 'schemaContext'
> & {
  topicName: string;
  filters: FilterEntry[];
  continuousPaginationEnabled: boolean;
};

function buildMessageSearchRequest(params: SearchRequestParams): MessageSearchRequest {
  const { topicName, filters, continuousPaginationEnabled, maxResults } = params;
  const canUseFilters = (api.topicPermissions.get(topicName)?.canUseSearchFilters ?? true) && !isServerless();

  const { filterCode, functionCount } = canUseFilters ? buildFilterCode(filters) : { filterCode: '', functionCount: 0 };
  if (IsDev && functionCount > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`constructed filter code (${functionCount} functions)`, `\n\n${filterCode}`);
  }

  // Calculate backend page size: for continuous pagination mode,
  // initial load fetches maxResults at once, subsequent loadMore calls use smaller pageSize.
  // We send maxResults as pageSize to enable pagination mode in the backend.
  return {
    topicName,
    partitionId: params.partitionID,
    startOffset: params.startOffset,
    startTimestamp: params.startTimestamp,
    maxResults,
    pageSize: continuousPaginationEnabled ? maxResults : undefined,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeRawPayload: true,
    keyDeserializer: params.keyDeserializer,
    valueDeserializer: params.valueDeserializer,
    schemaContext: params.schemaContext,
  } as MessageSearchRequest;
}

type SearchRunContext = Pick<
  SearchProgress,
  'setFetchError' | 'setSearchPhase' | 'setElapsedMs' | 'setBytesConsumed' | 'setTotalMessagesConsumed'
> &
  Pick<SearchRefs, 'isMountedRef' | 'windowStartPageRef' | 'lastLoadMoreRef'> & {
    setSearchState: SetSearchState;
    maxResults: number;
    pageSize: number;
  };

function reportSearchError(error: unknown, ctx: SearchRunContext): TopicMessage[] {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error(`error in searchTopicMessages: ${getSearchErrorMessage(error)}`);
  if (ctx.isMountedRef.current) {
    ctx.setFetchError(toDisplayError(error));
    ctx.setSearchPhase(null);
  }
  return [];
}

function applySearchResult(search: MessageSearch, result: TopicMessage[], startTime: number, ctx: SearchRunContext) {
  const endTime = Date.now();
  ctx.setSearchState((prev) => ({ ...prev, messages: result, windowStartPage: 0 }));
  ctx.windowStartPageRef.current = 0;
  if (ctx.maxResults < ctx.pageSize) {
    ctx.lastLoadMoreRef.current = { pageIndex: 0, total: result.length };
  }
  ctx.setSearchPhase(null);
  ctx.setElapsedMs(() => endTime - startTime);
  ctx.setBytesConsumed(search.bytesConsumed);
  ctx.setTotalMessagesConsumed(search.totalMessagesConsumed);
}

async function runMessageSearch(
  request: MessageSearchRequest,
  abortSignal: AbortSignal | undefined,
  ctx: SearchRunContext
): Promise<TopicMessage[]> {
  ctx.setFetchError(null);
  ctx.setSearchPhase('Searching...');

  const search = createMessageSearch();
  ctx.setSearchState((prev) => ({ ...prev, messageSearch: search }));
  const startTime = Date.now();

  const result = await search.startSearch(request, abortSignal).catch((err: unknown) => reportSearchError(err, ctx));

  if (!ctx.isMountedRef.current) {
    return result;
  }

  applySearchResult(search, result, startTime, ctx);
  return result;
}

type SearchInputs = {
  topicName: string;
  query: MessageQueryParams;
  paging: MessagePagingParams;
  filters: FilterEntry[];
};

function useExecuteMessageSearch(
  { topicName, query, paging, filters }: SearchInputs,
  progress: SearchProgress,
  setSearchState: SetSearchState,
  refs: SearchRefs
) {
  const { partitionID, startOffset, startTimestamp, maxResults, keyDeserializer, valueDeserializer, schemaContext } =
    query;
  const { continuousPaginationEnabled, pageSize } = paging;
  const { setFetchError, setSearchPhase, setElapsedMs, setBytesConsumed, setTotalMessagesConsumed } = progress;
  const { isMountedRef, windowStartPageRef, lastLoadMoreRef } = refs;

  return useCallback(
    async (abortSignal?: AbortSignal): Promise<TopicMessage[]> => {
      const ctx: SearchRunContext = {
        setFetchError,
        setSearchPhase,
        setElapsedMs,
        setBytesConsumed,
        setTotalMessagesConsumed,
        isMountedRef,
        windowStartPageRef,
        lastLoadMoreRef,
        setSearchState,
        maxResults,
        pageSize,
      };
      const request = buildMessageSearchRequest({
        topicName,
        filters,
        continuousPaginationEnabled,
        partitionID,
        startOffset,
        startTimestamp,
        maxResults,
        keyDeserializer,
        valueDeserializer,
        schemaContext,
      });

      try {
        return await runMessageSearch(request, abortSignal, ctx);
      } catch (error: unknown) {
        return reportSearchError(error, ctx);
      }
    },
    [
      topicName,
      partitionID,
      startOffset,
      startTimestamp,
      maxResults,
      continuousPaginationEnabled,
      pageSize,
      keyDeserializer,
      valueDeserializer,
      schemaContext,
      filters,
      setFetchError,
      setSearchPhase,
      setElapsedMs,
      setBytesConsumed,
      setTotalMessagesConsumed,
      isMountedRef,
      windowStartPageRef,
      lastLoadMoreRef,
      setSearchState,
    ]
  );
}

// Abort the current search if one is running
function abortRunningSearch(abortControllerRef: SearchRefs['abortControllerRef']) {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }
}

// Clear messages immediately when starting a new search
function clearForNewSearch(
  setSearchState: SetSearchState,
  { windowStartPageRef, lastLoadMoreRef }: Pick<SearchRefs, 'windowStartPageRef' | 'lastLoadMoreRef'>
) {
  setSearchState((prev) => ({
    ...prev,
    messages: [],
    virtualStartIndex: 0,
    windowStartPage: 0,
    loadMoreFailures: 0,
  }));
  windowStartPageRef.current = 0;
  lastLoadMoreRef.current = { pageIndex: -1, total: -1 };
}

function useSearchRunner(
  { query, filters }: Pick<SearchInputs, 'query' | 'filters'>,
  executeMessageSearch: (abortSignal?: AbortSignal) => Promise<TopicMessage[]>,
  setSearchState: SetSearchState,
  refs: SearchRefs,
  forceRefresh: number
) {
  const { startOffset, maxResults, partitionID, startTimestamp, keyDeserializer, valueDeserializer } = query;
  const { currentSearchRunRef, abortControllerRef, windowStartPageRef, lastLoadMoreRef } = refs;

  const searchFunc = useCallback(
    (source: 'auto' | 'manual') => {
      const searchParams = buildSearchSignature({
        startOffset,
        maxResults,
        partitionID,
        startTimestamp,
        keyDeserializer,
        valueDeserializer,
        filters,
      });

      if (searchParams === currentSearchRunRef.current && source === 'auto') {
        return;
      }

      abortRunningSearch(abortControllerRef);

      // Start new search
      currentSearchRunRef.current = searchParams;
      abortControllerRef.current = new AbortController();
      clearForNewSearch(setSearchState, { windowStartPageRef, lastLoadMoreRef });

      try {
        executeMessageSearch(abortControllerRef.current?.signal)
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          .catch(console.error)
          .finally(() => {
            currentSearchRunRef.current = null;
            abortControllerRef.current = null;
          });
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('error in message search', { error: err });
      }
    },
    [
      startOffset,
      maxResults,
      partitionID,
      startTimestamp,
      // A schema context change still re-searches: executeMessageSearch is rebuilt with it.
      executeMessageSearch,
      keyDeserializer,
      valueDeserializer,
      filters,
      currentSearchRunRef,
      abortControllerRef,
      windowStartPageRef,
      lastLoadMoreRef,
      setSearchState,
    ]
  );

  // Auto search when parameters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: forceRefresh is intentionally watched to trigger forced re-search
  useEffect(() => {
    // Set up auto-search with 100ms delay
    const timer = setTimeout(() => {
      searchFunc('auto');
    }, 100);

    appGlobal.searchMessagesFunc = searchFunc;

    return () => clearTimeout(timer);
  }, [searchFunc, forceRefresh]);

  return searchFunc;
}

type LoadMoreRefs = Pick<
  SearchRefs,
  | 'windowStartPageRef'
  | 'virtualStartIndexRef'
  | 'lastLoadMoreRef'
  | 'loadMoreAbortRef'
  | 'pageIndexRef'
  | 'currentMessageSearchRef'
  | 'isMountedRef'
>;

type LoadMoreRun = {
  messageSearch: MessageSearch;
  pageIndex: number;
  totalVirtualMessages: number;
  maxResults: number;
  pageSize: number;
  setSearchState: SetSearchState;
  refs: LoadMoreRefs;
};

function startLoadMore({
  messageSearch: capturedMessageSearch,
  pageIndex,
  totalVirtualMessages,
  maxResults,
  pageSize,
  setSearchState,
  refs,
}: LoadMoreRun) {
  const { windowStartPageRef, virtualStartIndexRef, lastLoadMoreRef, loadMoreAbortRef, pageIndexRef } = refs;
  const { currentMessageSearchRef, isMountedRef } = refs;
  // Prevent duplicate loads from effect re-runs
  lastLoadMoreRef.current = { pageIndex, total: totalVirtualMessages };

  const abortController = new AbortController();
  loadMoreAbortRef.current = abortController;

  setSearchState((prev) => ({ ...prev, loadMorePhase: 'loading' }));
  capturedMessageSearch
    .loadMore(maxResults)
    .then(
      (): {
        type: 'success' | 'stale';
        trimResult?: ReturnType<typeof trimSlidingWindow>;
        allMessagesLength?: number;
      } => {
        if (currentMessageSearchRef.current !== capturedMessageSearch) {
          return { type: 'stale' };
        }

        const allMessages = capturedMessageSearch.messages;

        const trimResult = trimSlidingWindow({
          messages: [...allMessages],
          maxResults,
          pageSize,
          currentGlobalPage: pageIndexRef.current,
          windowStartPage: windowStartPageRef.current,
          virtualStartIndex: virtualStartIndexRef.current,
        });

        // Free memory from the MobX observable array
        if (trimResult.trimCount > 0) {
          capturedMessageSearch.messages.splice(0, trimResult.trimCount);
        }

        // Update refs BEFORE setting state to prevent cascading
        windowStartPageRef.current = trimResult.windowStartPage;
        virtualStartIndexRef.current = trimResult.virtualStartIndex;
        lastLoadMoreRef.current = {
          pageIndex: pageIndexRef.current,
          total: trimResult.virtualStartIndex + trimResult.messages.length,
        };

        return { type: 'success', trimResult, allMessagesLength: allMessages.length };
      },
      (err: unknown) => {
        const shouldReport = isMountedRef.current && !abortController.signal.aborted;
        if (shouldReport) {
          toast.error('Failed to load more messages', { description: getSearchErrorMessage(err) });
        }
        return { type: 'error' as const, shouldReport };
      }
    )
    .then((result) => {
      setSearchState((prev) => {
        if (result.type === 'success' && result.trimResult) {
          return {
            ...prev,
            messages: result.trimResult.messages,
            totalLoadedCount: result.allMessagesLength ?? 0,
            windowStartPage: result.trimResult.windowStartPage,
            virtualStartIndex: result.trimResult.virtualStartIndex,
            loadMoreFailures: 0,
            loadMorePhase: 'idle',
          };
        }
        if (result.type === 'error') {
          return {
            ...prev,
            loadMoreFailures: result.shouldReport ? prev.loadMoreFailures + 1 : prev.loadMoreFailures,
            loadMorePhase: 'idle',
          };
        }
        return { ...prev, loadMorePhase: 'idle' };
      });
    })
    .finally(() => {
      if (loadMoreAbortRef.current === abortController) {
        loadMoreAbortRef.current = null;
      }
    });
}

// Auto-load more messages when user reaches beyond loaded messages (continuous pagination mode only)
function useContinuousLoadMore(
  { query, paging, filters }: Pick<SearchInputs, 'query' | 'paging' | 'filters'>,
  searchState: SearchState,
  searchPhase: string | null,
  setSearchState: SetSearchState,
  refs: SearchRefs
) {
  const { messages, messageSearch, loadMorePhase, loadMoreFailures } = searchState;
  const { pageIndex, pageSize, continuousPaginationEnabled } = paging;
  const { maxResults } = query;
  const isLoadingMore = loadMorePhase !== 'idle';
  const { windowStartPageRef, virtualStartIndexRef, lastLoadMoreRef, loadMoreAbortRef } = refs;
  const { pageIndexRef, currentMessageSearchRef, isMountedRef } = refs;

  useEffect(() => {
    if (
      !continuousPaginationEnabled ||
      filters.length > 0 ||
      !messageSearch ||
      !messageSearch.nextPageToken ||
      isLoadingMore ||
      searchPhase ||
      loadMoreFailures >= MAX_LOAD_MORE_RETRIES
    ) {
      return;
    }

    const { needsMoreMessages, totalVirtualMessages } = computeLoadMoreNeed({
      pageIndex,
      windowStartPage: windowStartPageRef.current,
      pageSize,
      loadedCount: messages.length,
      virtualStartIndex: virtualStartIndexRef.current,
      lastLoadMore: lastLoadMoreRef.current,
    });

    if (needsMoreMessages) {
      const loadMoreRefs = {
        windowStartPageRef,
        virtualStartIndexRef,
        lastLoadMoreRef,
        loadMoreAbortRef,
        pageIndexRef,
        currentMessageSearchRef,
        isMountedRef,
      };
      startLoadMore({
        messageSearch,
        pageIndex,
        totalVirtualMessages,
        maxResults,
        pageSize,
        setSearchState,
        refs: loadMoreRefs,
      });
    }

    return () => {
      if (loadMoreAbortRef.current) {
        loadMoreAbortRef.current.abort();
        loadMoreAbortRef.current = null;
      }
    };
    // Note: virtualStartIndex intentionally excluded — the effect reads it via ref
  }, [
    pageIndex,
    continuousPaginationEnabled,
    maxResults,
    filters.length,
    messageSearch,
    isLoadingMore,
    searchPhase,
    messages.length,
    pageSize,
    loadMoreFailures,
    setSearchState,
    windowStartPageRef,
    virtualStartIndexRef,
    lastLoadMoreRef,
    loadMoreAbortRef,
    pageIndexRef,
    currentMessageSearchRef,
    isMountedRef,
  ]);
}

// Reset pagination when navigating back to page 1 in continuous pagination mode
// This prevents keeping many pages in memory and triggering excessive requests
function usePaginationReset(paging: MessagePagingParams, setSearchState: SetSearchState, refs: SearchRefs) {
  const { pageIndex, continuousPaginationEnabled } = paging;
  const { prevPageIndexRef, currentMessageSearchRef, windowStartPageRef, lastLoadMoreRef, currentSearchRunRef } = refs;

  useEffect(() => {
    // Check if we're in continuous pagination mode and user navigated back to page 1 from a higher page
    // Use ref to check messageSearch existence to avoid circular dependency
    if (
      continuousPaginationEnabled &&
      pageIndex === 0 &&
      prevPageIndexRef.current > 1 &&
      currentMessageSearchRef.current
    ) {
      // Reset all search and pagination state, trigger forced refresh
      setSearchState((prev) => ({
        ...prev,
        messages: [],
        messageSearch: null,
        loadMoreFailures: 0,
        loadMorePhase: 'idle',
        totalLoadedCount: 0,
        virtualStartIndex: 0,
        windowStartPage: 0,
        forceRefresh: prev.forceRefresh + 1,
      }));
      windowStartPageRef.current = 0;
      // Reset last loadMore page tracking
      lastLoadMoreRef.current = { pageIndex: -1, total: -1 };
      // Clear the search run ref
      currentSearchRunRef.current = null;
    }
    prevPageIndexRef.current = pageIndex;
    // Note: messageSearch intentionally excluded to avoid circular dependency
    // We use currentMessageSearchRef.current instead which is always in sync
  }, [
    pageIndex,
    continuousPaginationEnabled,
    setSearchState,
    prevPageIndexRef,
    currentMessageSearchRef,
    windowStartPageRef,
    lastLoadMoreRef,
    currentSearchRunRef,
  ]);
}

/**
 * Runs the message search for the current parameters: an automatic search whenever they change,
 * and in continuous pagination a sliding window of pages loaded as the user pages forward.
 */
export function useMessageSearch(inputs: SearchInputs) {
  const [searchState, setSearchState] = useState<SearchState>(INITIAL_SEARCH_STATE);
  const progress = useSearchProgress();
  const refs = useSearchRefs(inputs.paging.pageIndex);

  useLoadingIndicatorDelay(searchState.loadMorePhase, setSearchState);
  useSearchRefSync(searchState, inputs.paging.pageIndex, refs);

  const executeMessageSearch = useExecuteMessageSearch(inputs, progress, setSearchState, refs);
  const searchFunc = useSearchRunner(inputs, executeMessageSearch, setSearchState, refs, searchState.forceRefresh);
  useContinuousLoadMore(inputs, searchState, progress.searchPhase, setSearchState, refs);
  usePaginationReset(inputs.paging, setSearchState, refs);

  return {
    ...progress,
    searchState,
    setSearchState,
    executeMessageSearch,
    searchFunc,
    abortControllerRef: refs.abortControllerRef,
  };
}

export type MessageSearchController = ReturnType<typeof useMessageSearch>;
