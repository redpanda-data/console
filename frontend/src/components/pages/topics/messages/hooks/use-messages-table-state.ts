import type { PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo } from 'react';

import { useClientFilters } from './use-client-filters';
import { useKeyboardNav } from './use-keyboard-nav';
import type { MessageSearchPhase, MessageSearchResult } from './use-message-search';
import type { MessagesUrlState } from './use-messages-url-state';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { DISPLAY_WINDOW_CAP } from '../constants';
import { applyDisplayWindow } from '../utils/live-window';
import { messageKey } from '../utils/message-key';
import { orderForContinuousNewest, visiblePageKeys } from '../utils/message-order';

/**
 * A deep link (`?page=3`) or filters shrinking the row set can leave `page` past the last
 * real page — tanstack won't self-correct (autoResetPageIndex: false, see
 * messages-table.tsx) and continuous mode's footer has no pager to click back with, so it'd
 * render permanently blank. Clamp once a fetch has actually settled (`done`) so a deep link
 * to a later page isn't wiped out while the real count is still loading.
 */
function useClampPageIndex(
  phase: MessageSearchPhase,
  rowCount: number,
  continuousActive: boolean,
  urlState: MessagesUrlState
) {
  useEffect(
    function clampPageIndexToLastPage() {
      if (phase !== 'done') {
        return;
      }
      const pageCount = continuousActive ? 1 : Math.max(1, Math.ceil(rowCount / urlState.pageSize));
      if (urlState.pageIndex > pageCount - 1) {
        urlState.setPageIndex(pageCount - 1);
      }
    },
    [phase, continuousActive, rowCount, urlState.pageSize, urlState.pageIndex, urlState.setPageIndex]
  );
}

/** The rows the table renders: ordered for continuous + "Newest", then trimmed to the display window. */
function useDisplayWindow(
  filteredMessages: TopicMessage[],
  continuousActive: boolean,
  { readScopeMode, liveTail }: Pick<MessagesUrlState, 'readScopeMode' | 'liveTail'>
) {
  // Continuous mode disables the table's own sort to preserve server order for paging, but for
  // "Newest" that server order is partition-grouped, not chronological — force it back to
  // newest-first here, same as the legacy page did. This must run *before* windowing below:
  // the display window trims by arrival position, and continuous+"Newest" arrives
  // newest→oldest per partition batch, not oldest→newest like every other scope.
  const orderedMessages = useMemo(
    () => orderForContinuousNewest(filteredMessages, continuousActive, readScopeMode),
    [filteredMessages, continuousActive, readScopeMode]
  );

  // In continuous or live mode only DISPLAY_WINDOW_CAP rows stay rendered. The window keeps
  // the tail of the ordered array — the loading frontier — so "Load more" always reveals the
  // page it just fetched: continuous+"Newest" pages backward through ever-older rows (trimming
  // the newest once past the cap — the footer says so), every other scope trims the oldest.
  const { rows: windowedMessages, trimmed } = useMemo(
    () =>
      continuousActive || liveTail
        ? applyDisplayWindow(orderedMessages, DISPLAY_WINDOW_CAP)
        : { rows: orderedMessages, trimmed: 0 },
    [orderedMessages, continuousActive, liveTail]
  );

  // Stable mutable copy for consumers typed as TopicMessage[] — a fresh array on
  // every render would defeat react-table's data memoization.
  const tableData = useMemo(() => [...windowedMessages], [windowedMessages]);

  return {
    windowedMessages,
    trimmed,
    tableData,
    continuousNewest: continuousActive && readScopeMode === 'newest',
  };
}

/** Table paging and sorting, read from and written back to the URL. */
function useMessagePaging(urlState: MessagesUrlState, continuousActive: boolean, windowSize: number) {
  const pagination: PaginationState = useMemo(
    () => ({
      pageIndex: urlState.pageIndex,
      pageSize: continuousActive ? Math.max(windowSize, 1) : urlState.pageSize,
    }),
    [urlState.pageIndex, urlState.pageSize, continuousActive, windowSize]
  );

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      urlState.setPageIndex(next.pageIndex);
      if (!continuousActive) {
        urlState.setPageSize(next.pageSize);
      }
    },
    [pagination, urlState.setPageIndex, urlState.setPageSize, continuousActive]
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(urlState.sorting) : updater;
      urlState.setSortingState(next);
    },
    [urlState.sorting, urlState.setSortingState]
  );

  return { pagination, handlePaginationChange, handleSortingChange };
}

/** The selected row (kept in the URL) and the detail panel's large-payload reload. */
function useMessageSelection(
  search: Pick<MessageSearchResult, 'messages' | 'loadLargeMessage'>,
  { selectedKey, setSelectedKey }: Pick<MessagesUrlState, 'selectedKey' | 'setSelectedKey'>,
  setViewSettingsOpen: (open: boolean) => void
) {
  // Row clicks always select (mock behavior) — switching rows swaps the open
  // detail (docked or expanded) in place; closing is the panel's own X.
  const handleRowClick = useCallback(
    (msg: TopicMessage) => {
      // Detail and view settings are distinct right-side surfaces — one at a time
      setViewSettingsOpen(false);
      setSelectedKey(messageKey(msg));
    },
    [setSelectedKey, setViewSettingsOpen]
  );

  const selectedMessage = useMemo(
    () => (selectedKey ? (search.messages.find((m) => messageKey(m) === selectedKey) ?? null) : null),
    [selectedKey, search.messages]
  );

  const handleLoadLargeMessage = useCallback(() => {
    if (!selectedMessage) {
      return Promise.resolve();
    }
    return search.loadLargeMessage(selectedMessage.partitionID, selectedMessage.offset);
  }, [selectedMessage, search.loadLargeMessage]);

  return { handleRowClick, selectedMessage, handleLoadLargeMessage };
}

type MessageKeyboardNavOptions = {
  messages: TopicMessage[];
  windowedMessages: readonly TopicMessage[];
  urlState: MessagesUrlState;
  continuousActive: boolean;
  pagination: PaginationState;
  enabled: boolean;
};

/**
 * Keyboard nav follows the on-screen order: current sort, then current page.
 * windowedMessages (not orderedMessages) so this matches what the table actually
 * renders — ordered for continuous + Newest, and trimmed to the display window.
 */
function useMessageKeyboardNav({
  messages,
  windowedMessages,
  urlState,
  continuousActive,
  pagination,
  enabled,
}: MessageKeyboardNavOptions) {
  const visibleKeys = useMemo(
    () =>
      visiblePageKeys(windowedMessages, {
        sorting: urlState.sorting,
        sortingDisabled: continuousActive,
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
      }),
    [windowedMessages, urlState.sorting, continuousActive, pagination]
  );

  const getCopyText = useCallback((key: string) => messages.find((m) => messageKey(m) === key)?.valueJson, [messages]);

  useKeyboardNav({
    visibleKeys,
    selectedKey: urlState.selectedKey,
    onSelect: urlState.setSelectedKey,
    getCopyText,
    enabled,
  });
}

export type MessagesTableStateOptions = {
  search: Pick<MessageSearchResult, 'messages' | 'phase' | 'loadLargeMessage'>;
  urlState: MessagesUrlState;
  partitionCount: number;
  continuousActive: boolean;
  /** Selecting a row closes view settings: detail and view settings share the right dock. */
  setViewSettingsOpen: (open: boolean) => void;
  keyboardNavEnabled: boolean;
};

/**
 * The messages table's client-side state: filtering, ordering and windowing of the loaded rows,
 * paging and sorting, row selection, and keyboard navigation over what's on screen.
 */
export function useMessagesTableState({
  search,
  urlState,
  partitionCount,
  continuousActive,
  setViewSettingsOpen,
  keyboardNavEnabled,
}: MessagesTableStateOptions) {
  const filteredMessages = useClientFilters(
    search.messages,
    urlState.quickSearch,
    urlState.fieldTokens,
    partitionCount
  );
  useClampPageIndex(search.phase, filteredMessages.length, continuousActive, urlState);
  const display = useDisplayWindow(filteredMessages, continuousActive, urlState);
  const paging = useMessagePaging(urlState, continuousActive, display.windowedMessages.length);
  const selection = useMessageSelection(search, urlState, setViewSettingsOpen);
  useMessageKeyboardNav({
    messages: search.messages,
    windowedMessages: display.windowedMessages,
    urlState,
    continuousActive,
    pagination: paging.pagination,
    enabled: keyboardNavEnabled,
  });

  return { filteredMessages, ...display, ...paging, ...selection };
}
