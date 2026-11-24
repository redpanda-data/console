import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLiveTailLoop } from './use-live-tail-loop';
import type { MessageSearchParams, MessageSearchResult } from './use-message-search';
import type { MessagesUrlState } from './use-messages-url-state';
import { isServerless } from '../../../../../config';
import { appGlobal } from '../../../../../state/app-global';
import { useApiStoreHook } from '../../../../../state/backend-api';
import { type FilterEntry, PartitionOffsetOrigin } from '../../../../../state/ui';
import { buildFilterInterpreterCode } from '../utils/js-filters';

/**
 * The toggle state persists across mode switches, but continuous pagination only applies to the
 * newest/oldest scopes (never to offset/timestamp or live).
 */
export const isContinuousPagingActive = ({
  continuousMode,
  readScopeMode,
  liveTail,
}: Pick<MessagesUrlState, 'continuousMode' | 'readScopeMode' | 'liveTail'>) =>
  continuousMode && (readScopeMode === 'newest' || readScopeMode === 'oldest') && !liveTail;

/** What the page asks the backend for: the search params, the JS predicate, and whether pages load continuously. */
export function useMessagesQuery(topicName: string, urlState: MessagesUrlState, jsFilters: FilterEntry[]) {
  const continuousActive = isContinuousPagingActive(urlState);
  const topicPermissions = useApiStoreHook((s) => s.topicPermissions.get(topicName));
  const canUseJsFilters = (topicPermissions?.canUseSearchFilters ?? true) && !isServerless() && !continuousActive;

  const filterInterpreterCode = useMemo(
    () => (canUseJsFilters ? buildFilterInterpreterCode(jsFilters) : ''),
    [jsFilters, canUseJsFilters]
  );

  const searchParams: MessageSearchParams = useMemo(
    () => ({
      startOffset: urlState.startOffset,
      startTimestamp: urlState.readScopeMode === 'timestamp' ? urlState.startTimestamp : -1,
      partitionId: urlState.partitionId,
      maxResults: urlState.maxResults,
      pageSize: continuousActive ? urlState.maxResults : undefined,
      filterInterpreterCode,
      keyDeserializer: urlState.keyDeserializer,
      valueDeserializer: urlState.valueDeserializer,
      schemaContext: urlState.schemaContext,
      includeRawPayload: true,
    }),
    [
      urlState.startOffset,
      urlState.startTimestamp,
      urlState.readScopeMode,
      urlState.partitionId,
      urlState.maxResults,
      continuousActive,
      urlState.keyDeserializer,
      urlState.valueDeserializer,
      urlState.schemaContext,
      filterInterpreterCode,
    ]
  );

  return { continuousActive, canUseJsFilters, filterInterpreterCode, searchParams };
}

type AutoSearchOptions = {
  search: Pick<MessageSearchResult, 'start' | 'stop'>;
  searchParams: MessageSearchParams;
  refreshCounter: number;
  liveTail: boolean;
};

/**
 * Auto-search on parameter change: 100ms debounce with a signature guard so unrelated re-renders
 * don't restart an identical stream (ported from legacy). Inert while live tail owns the stream.
 */
export function useAutoSearch({ search, searchParams, refreshCounter, liveTail }: AutoSearchOptions) {
  const lastSignatureRef = useRef<string | null>(null);
  useEffect(
    function startDebouncedSearch() {
      if (liveTail) {
        return; // live tail owns the stream (P5)
      }
      if (searchParams.startOffset === PartitionOffsetOrigin.Timestamp && searchParams.startTimestamp < 0) {
        return;
      }
      const signature = `${JSON.stringify(searchParams)}|${refreshCounter}`;
      if (signature === lastSignatureRef.current) {
        return;
      }
      const timer = setTimeout(() => {
        lastSignatureRef.current = signature;
        search.start(searchParams).catch(() => {});
      }, 100);
      // WARNING: Abort an in-flight search as soon as parameters change; clearing its already-fired debounce timer is not enough.
      return () => {
        clearTimeout(timer);
        search.stop();
      };
    },
    [searchParams, refreshCounter, liveTail, search.start, search.stop]
  );

  useEffect(
    function resetSignatureWhileLive() {
      if (liveTail) {
        lastSignatureRef.current = null;
      }
    },
    [liveTail]
  );
}

type SearchRunnerOptions = {
  search: Pick<MessageSearchResult, 'start' | 'stop'>;
  searchParams: MessageSearchParams;
  filterInterpreterCode: string;
  liveTail: boolean;
  partitionId: number;
};

/**
 * Keeps the stream running for the current params: the debounced paged search, or the live-tail
 * loop while live tail is on. `handleRefresh` re-runs the paged search, or re-arms the tail.
 * In live mode, changing a committed JS filter or partition restarts the stream; a deserializer edit applies on its next start.
 * Refresh restarts live tail with a fresh failure budget. Clean backend completions reopen the bounded stream.
 */
export function useSearchRunner({
  search,
  searchParams,
  filterInterpreterCode,
  liveTail,
  partitionId,
}: SearchRunnerOptions) {
  const [refreshCounter, setRefreshCounter] = useState(0);
  useAutoSearch({ search, searchParams, refreshCounter, liveTail });

  const latestSearchParamsRef = useRef(searchParams);
  useEffect(
    function trackLatestSearchParams() {
      latestSearchParamsRef.current = searchParams;
    },
    [searchParams]
  );
  const startLiveTail = useCallback(
    (append: boolean) =>
      search.start(
        {
          ...latestSearchParamsRef.current,
          filterInterpreterCode,
          partitionId,
          startOffset: PartitionOffsetOrigin.End,
          pageSize: undefined,
        },
        { live: true, append }
      ),
    [search.start, filterInterpreterCode, partitionId]
  );

  const liveTailLoop = useLiveTailLoop({ active: liveTail, start: startLiveTail, stop: search.stop });

  const handleRefresh = useCallback(() => {
    if (liveTail) {
      liveTailLoop.restart();
      return;
    }
    setRefreshCounter((c) => c + 1);
  }, [liveTail, liveTailLoop.restart]);

  useEffect(function registerGlobalSearchTrigger() {
    appGlobal.searchMessagesFunc = () => setRefreshCounter((c) => c + 1);
    return () => {
      appGlobal.searchMessagesFunc = undefined;
    };
  }, []);

  return { liveTailStatus: liveTailLoop.status, handleRefresh };
}
