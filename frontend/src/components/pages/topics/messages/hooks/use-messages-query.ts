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

  // Combine active JS filters into the base64 backend predicate (AND semantics)
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
      // Timestamp mode starts at -1 (unset) for one render until the date picker's
      // own mount effect corrects it to "now" — searching on that sentinel would
      // send an invalid startTimestamp to the backend instead of waiting the one
      // tick for the real value.
      if (searchParams.startOffset === PartitionOffsetOrigin.Timestamp && searchParams.startTimestamp < 0) {
        return;
      }
      const signature = `${JSON.stringify(searchParams)}|${refreshCounter}`;
      if (signature === lastSignatureRef.current) {
        return;
      }
      const timer = setTimeout(() => {
        lastSignatureRef.current = signature;
        search.start(searchParams).catch(() => {
          // errors are surfaced through search.error
        });
      }, 100);
      // Also stop() here (not just clear the timer): if the previous run's timer
      // already fired and a stream is in flight, changing params again must abort
      // it immediately rather than leaving it running until some later start()
      // happens to supersede it.
      return () => {
        clearTimeout(timer);
        search.stop();
      };
    },
    [searchParams, refreshCounter, liveTail, search.start, search.stop]
  );

  // Live tail owns the stream; clearing the signature when it activates lets the paged
  // auto-search above re-run once live tail is turned back off.
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

  // Every (re)start reads the params current at that moment, but only a committed JS filter or
  // partition restarts a running tail: both stay editable while live, and the running stream must
  // not leave the UI showing a change it never picks up. Scope edits (offset, timestamp, max
  // results) are disabled in the UI while live, and a deserializer change takes effect on the
  // next (re)start instead of resetting the streamed table.
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

  // Stream from the log's end for as long as live tail is on; restarts on every clean
  // completion (the backend bounds a "from newest" consume to maxResults per partition and
  // then completes — list_messages.go — it isn't an actually-endless stream), and backs off
  // instead of hammering the backend when the stream keeps failing. `status` (not the URL
  // toggle) drives the "streaming" UI, and `restart` is the recovery path once the loop's
  // retry budget is exhausted.
  const liveTailLoop = useLiveTailLoop({ active: liveTail, start: startLiveTail, stop: search.stop });

  // In live mode "refresh" (and the error state's Retry) restarts the tail loop with a fresh
  // failure budget — the only way back once its retries are exhausted, since the paged
  // auto-search is inert while the toggle is on.
  const handleRefresh = useCallback(() => {
    if (liveTail) {
      liveTailLoop.restart();
      return;
    }
    setRefreshCounter((c) => c + 1);
  }, [liveTail, liveTailLoop.restart]);

  // DeleteRecordsModal (and other page-level actions) re-trigger the search through this global
  useEffect(function registerGlobalSearchTrigger() {
    appGlobal.searchMessagesFunc = () => setRefreshCounter((c) => c + 1);
    return () => {
      appGlobal.searchMessagesFunc = undefined;
    };
  }, []);

  return { liveTailStatus: liveTailLoop.status, handleRefresh };
}
