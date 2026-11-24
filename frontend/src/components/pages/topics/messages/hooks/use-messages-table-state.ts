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

function useDisplayWindow(
  filteredMessages: TopicMessage[],
  continuousActive: boolean,
  { readScopeMode, liveTail }: Pick<MessagesUrlState, 'readScopeMode' | 'liveTail'>
) {
  const orderedMessages = useMemo(
    () => orderForContinuousNewest(filteredMessages, continuousActive, readScopeMode),
    [filteredMessages, continuousActive, readScopeMode]
  );

  const { rows: windowedMessages, trimmed } = useMemo(
    () =>
      continuousActive || liveTail
        ? applyDisplayWindow(orderedMessages, DISPLAY_WINDOW_CAP)
        : { rows: orderedMessages, trimmed: 0 },
    [orderedMessages, continuousActive, liveTail]
  );

  const tableData = useMemo(() => [...windowedMessages], [windowedMessages]);

  return {
    windowedMessages,
    trimmed,
    tableData,
    continuousNewest: continuousActive && readScopeMode === 'newest',
  };
}

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

function useMessageSelection(
  search: Pick<MessageSearchResult, 'messages' | 'loadLargeMessage'>,
  { selectedKey, setSelectedKey }: Pick<MessagesUrlState, 'selectedKey' | 'setSelectedKey'>,
  setViewSettingsOpen: (open: boolean) => void
) {
  const handleRowClick = useCallback(
    (msg: TopicMessage) => {
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
 * Continuous newest-first results are ordered across partitions before trimming; the kept tail is the load-more frontier.
 *
 * Clamp a stale page only after results settle, so a later-page bookmark is not reset during loading. Keyboard navigation follows the sorted, visible window and current page.
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
