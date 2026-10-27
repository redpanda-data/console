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

import clsx from 'clsx';
import { DownloadIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  type DataTableColumnDef,
  DataTablePagination,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import React, { useCallback } from 'react';

import { SaveMessagesDialog } from './dialogs/save-messages-dialog';
import type { MessageSearchController, SetSearchState } from './hooks/use-message-search';
import type {
  MessagePagingParams,
  MessageQueryParams,
  MessageViewDialogs,
  TopicViewSettings,
} from './hooks/use-message-view-params';
import { ExpandedMessage } from './message-display/expanded-message';
import { getPageWindow, getVisibleMessages } from './message-search-helpers';
import { buildMessageColumns, expanderColumn, onCopyKey, onCopyValue } from './message-table-columns';
import { ColumnSettings } from './modals/column-settings';
import { DeserializersModal } from './modals/deserializers-modal';
import { PreviewFieldsModal } from './modals/preview-fields-modal';
import type { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { createMessageSearch, type MessageSearchRequest } from '../../../../state/backend-api';
import type { Topic, TopicMessage } from '../../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../../state/ui';
import { uiState } from '../../../../state/ui-state';

type LoadLargeMessageParams = {
  topicName: string;
  messagePartitionID: number;
  offset: number;
  setSearchState: SetSearchState;
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
  schemaContext: string;
};

async function loadLargeMessage({
  topicName,
  messagePartitionID,
  offset,
  setSearchState,
  keyDeserializer,
  valueDeserializer,
  schemaContext,
}: LoadLargeMessageParams) {
  // Create a new search that looks for only this message specifically
  const search = createMessageSearch();
  const searchReq: MessageSearchRequest = {
    filterInterpreterCode: '',
    maxResults: 1,
    partitionId: messagePartitionID,
    startOffset: offset,
    startTimestamp: 0,
    topicName,
    includeRawPayload: true,
    ignoreSizeLimit: true,
    keyDeserializer,
    valueDeserializer,
    schemaContext,
  };
  const result = await search.startSearch(searchReq);

  if (result && result.length === 1) {
    // We must update the old message (that still says "payload too large")
    // So we just find its index and replace it in the array we are currently displaying
    setSearchState((prev) => {
      const indexOfOldMessage = prev.messages.findIndex(
        (x) => x.partitionID === messagePartitionID && x.offset === offset
      );
      if (indexOfOldMessage > -1) {
        const newMessages = [...prev.messages];
        newMessages[indexOfOldMessage] = result[0];
        return { ...prev, messages: newMessages };
      }
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: cannot find old message to replace', {
        searchReq,
        result,
      });
      throw new Error(
        'LoadLargeMessage: Cannot find old message to replace (message results must have changed since the load was started)'
      );
    });
  } else {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('LoadLargeMessage: messages response is empty', { result });
    throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
  }
}

type PageWindow = ReturnType<typeof getPageWindow>;

function useMessagesTable({
  data,
  columns,
  paging,
  maxResults,
  pageWindow,
  windowStartPage,
}: {
  data: TopicMessage[];
  columns: DataTableColumnDef<TopicMessage>[];
  paging: MessagePagingParams;
  maxResults: number;
  pageWindow: PageWindow;
  windowStartPage: number;
}) {
  const { continuousPaginationEnabled, pageSize, sorting, setPageIndex, setPageSize, setSortingState } = paging;
  const paginationParams = {
    pageIndex: pageWindow.tablePageIndex,
    pageSize: continuousPaginationEnabled && maxResults < pageSize ? maxResults : pageSize,
  };

  return useDataTable({
    data,
    columns: [expanderColumn, ...columns],
    enableRowSelection: false,
    state: {
      pagination: paginationParams,
      sorting,
    },
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' ? updater(paginationParams) : updater;
      uiState.topicSettings.searchParams.pageSize = newState.pageSize;
      if (continuousPaginationEnabled) {
        setPageIndex(() => windowStartPage + newState.pageIndex);
      } else {
        setPageIndex(newState.pageIndex);
      }
      setPageSize(newState.pageSize);
    },
    onSortingChange: (updater) => {
      if (continuousPaginationEnabled) {
        return;
      }
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSortingState(newSorting);
    },
    getRowCanExpand: () => true,
    autoResetPageIndex: false,
    // Expanded rows must survive a data swap: loadLargeMessage replaces the message
    // array, and v9 resets expanded state on every row-structure change.
    autoResetExpanded: false,
  });
}

type MessagesTable = ReturnType<typeof useMessagesTable>;

function MessagesTableRows({
  table,
  isSearching,
  hasMessages,
  topicName,
  onLoadLargeMessage,
  onSetDownloadMessages,
}: {
  table: MessagesTable;
  isSearching: boolean;
  hasMessages: boolean;
  topicName: string;
  onLoadLargeMessage: (topicName: string, partitionID: number, offset: number) => Promise<void>;
  onSetDownloadMessages: (messages: TopicMessage[]) => void;
}) {
  if (isSearching && !hasMessages) {
    return (
      <TableRow>
        <TableCell align="center" colSpan={table.getVisibleFlatColumns().length}>
          <Spinner />
        </TableCell>
      </TableRow>
    );
  }
  if (!hasMessages) {
    return (
      <TableRow>
        <TableCell align="center" colSpan={table.getVisibleFlatColumns().length}>
          No messages
        </TableCell>
      </TableRow>
    );
  }
  return table.getRowModel().rows.map((row) => (
    <React.Fragment key={row.id}>
      <TableRow>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} style={{ width: cell.column.getSize() === 150 ? undefined : cell.column.getSize() }}>
            {<table.FlexRender cell={cell} />}
          </TableCell>
        ))}
      </TableRow>
      {row.getIsExpanded() && (
        <TableRow>
          <TableCell colSpan={row.getVisibleCells().length}>
            <ExpandedMessage
              msg={row.original}
              onCopyKey={onCopyKey}
              onCopyValue={onCopyValue}
              onLoadLargeMessage={onLoadLargeMessage}
              onSetDownloadMessages={onSetDownloadMessages}
              topicName={topicName}
            />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  ));
}

function ContinuousPagination({
  paging,
  pageWindow,
  windowStartPage,
}: {
  paging: MessagePagingParams;
  pageWindow: PageWindow;
  windowStartPage: number;
}) {
  const { pageIndex, setPageIndex, pageSize, setPageSize } = paging;
  const { localPageIndex, boundedLocalPageIndex, loadedPages, hasMoreData } = pageWindow;
  return (
    <div className="flex items-center justify-end px-2 py-2">
      <div className="flex items-center space-x-6 lg:space-x-8">
        {/* Page counter */}
        <div className="flex w-[100px] items-center justify-center text-body font-medium">
          Page {pageIndex + 1}
          {hasMoreData ? '' : ` of ${windowStartPage + loadedPages}`}
        </div>

        {/* Rows per page selector */}
        <div className="flex items-center space-x-2">
          <p className="text-body font-medium">Rows per page</p>
          <Select
            onValueChange={(value) => {
              const newSize = Number(value);
              uiState.topicSettings.searchParams.pageSize = newSize;
              setPageSize(newSize);
            }}
            value={`${pageSize}`}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 25, 30, 40, 50].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center space-x-2">
          <Button
            className="hidden size-8 lg:flex"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex(0)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>

          <Button
            className="size-8"
            disabled={localPageIndex === 0}
            onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>

          <Button
            className="size-8"
            disabled={boundedLocalPageIndex >= loadedPages - 1 && !hasMoreData}
            onClick={() => setPageIndex((prev) => (prev ?? 0) + 1)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>

          <Button className="hidden size-8 lg:flex" disabled size="icon" variant="outline">
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Sortable column titles, with an arrow for the active sort direction.
function MessagesTableHeader({ table }: { table: MessagesTable }) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <TableHead
              className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
              key={header.id}
              onClick={header.column.getToggleSortingHandler()}
              style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
            >
              {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              {header.column.getIsSorted() === 'asc' && ' ↑'}
              {header.column.getIsSorted() === 'desc' && ' ↓'}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}

type MessageColumnsInput = Pick<MessagesResultsProps, 'topic' | 'query' | 'settings' | 'dialogs'> & {
  continuousPaginationEnabled: boolean;
};

// The table's columns for the topic's preview settings and the chosen deserializers.
function messageColumnsFor({ topic, query, settings, dialogs, continuousPaginationEnabled }: MessageColumnsInput) {
  const topicSettings = settings.topicSettings;
  return buildMessageColumns({
    continuousPaginationEnabled,
    tsFormat: topicSettings?.previewTimestamps ?? 'default',
    keyDeserializer: query.keyDeserializer,
    valueDeserializer: query.valueDeserializer,
    hasKeyTags: (topicSettings?.previewTags ?? []).filter((x) => x.isActive && x.searchInMessageKey).length > 0,
    previewDisplayMode: settings.previewDisplayMode,
    activePreviewTags: settings.activePreviewTags,
    isCompactTopic: topic.cleanupPolicy.includes('compact'),
    previewColumnFields: topicSettings?.previewColumnFields ?? [],
    onShowDeserializers: () => dialogs.setShowDeserializersModal(true),
    onSaveMessage: (message) => dialogs.setDownloadMessages([message]),
  });
}

type MessagesResultsProps = {
  topic: Topic;
  query: MessageQueryParams;
  paging: MessagePagingParams;
  settings: TopicViewSettings;
  search: MessageSearchController;
  dialogs: MessageViewDialogs;
  quickSearch: string;
  filtersCount: number;
};

/** The message table with its pagination, the loaded-window summary, and the save and settings dialogs. */
export function MessagesResults({
  topic,
  query,
  paging,
  settings,
  search,
  dialogs,
  quickSearch,
  filtersCount,
}: MessagesResultsProps) {
  const { messages, messageSearch, windowStartPage, virtualStartIndex, loadMorePhase } = search.searchState;
  const { continuousPaginationEnabled } = paging;
  const filteredMessages = getVisibleMessages(
    messages,
    quickSearch,
    continuousPaginationEnabled && query.startOffset === PartitionOffsetOrigin.EndMinusResults
  );
  const pageWindow = getPageWindow({
    continuousPaginationEnabled,
    pageIndex: paging.pageIndex,
    windowStartPage,
    messageCount: filteredMessages.length,
    pageSize: paging.pageSize,
    hasNextPage: Boolean(messageSearch?.nextPageToken),
  });
  const columns = messageColumnsFor({ topic, query, settings, dialogs, continuousPaginationEnabled });
  const table = useMessagesTable({
    data: filteredMessages,
    columns,
    paging,
    maxResults: query.maxResults,
    pageWindow,
    windowStartPage,
  });

  const { keyDeserializer, valueDeserializer, schemaContext } = query;
  const { setSearchState } = search;
  const onLoadLargeMessage = useCallback(
    (targetTopicName: string, messagePartitionID: number, offset: number) =>
      loadLargeMessage({
        topicName: targetTopicName,
        messagePartitionID,
        offset,
        setSearchState,
        keyDeserializer,
        valueDeserializer,
        schemaContext,
      }),
    [keyDeserializer, schemaContext, setSearchState, valueDeserializer]
  );

  return (
    <>
      <div data-testid="messages-table">
        <Table>
          <MessagesTableHeader table={table} />
          <TableBody>
            <MessagesTableRows
              hasMessages={filteredMessages.length > 0}
              isSearching={search.searchPhase !== null}
              onLoadLargeMessage={onLoadLargeMessage}
              onSetDownloadMessages={dialogs.setDownloadMessages}
              table={table}
              topicName={topic.topicName}
            />
          </TableBody>
        </Table>
      </div>

      {/* Normal pagination */}
      {!continuousPaginationEnabled && filteredMessages.length > 0 && (
        <div className="pt-2">
          <DataTablePagination table={table} />
        </div>
      )}

      {/* Infinite scroll pagination */}
      {continuousPaginationEnabled && filteredMessages.length > 0 && (
        <ContinuousPagination pageWindow={pageWindow} paging={paging} windowStartPage={windowStartPage} />
      )}

      {/* Virtual page indicator for continuous pagination mode */}
      {continuousPaginationEnabled && messages.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-body text-muted-foreground">
          <span>
            Loaded messages {virtualStartIndex + 1}-{virtualStartIndex + messages.length}
            {` (pages ${windowStartPage + 1}–${windowStartPage + pageWindow.loadedPages} in memory)`}
            {messageSearch?.nextPageToken ? ' · more available' : ''}
          </span>
        </div>
      )}

      {/* Warning when filters are active with continuous pagination */}
      {continuousPaginationEnabled && filtersCount > 0 && messages.length > 0 && (
        <Alert className="mt-4">
          <AlertDescription>
            Auto-pagination is disabled when filters are active. Remove filters to enable automatic loading.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading indicator when fetching more pages */}
      <div
        className={clsx(
          'mt-4 flex h-6 items-center justify-center',
          continuousPaginationEnabled && loadMorePhase === 'loading-visible' ? 'visible' : 'invisible'
        )}
      >
        <Spinner className="mr-2" />
        <span>Loading more messages...</span>
      </div>

      <Button
        className="mt-4"
        data-testid="save-messages-button"
        disabled={messages.length === 0}
        onClick={() => {
          dialogs.setDownloadMessages(messages);
        }}
        variant="outline"
      >
        <span style={{ paddingRight: '4px' }}>
          <DownloadIcon />
        </span>
        Save Messages
      </Button>

      <SaveMessagesDialog
        messages={dialogs.downloadMessages}
        onClose={() => dialogs.setDownloadMessages(null)}
        onRequireRawPayload={() => search.executeMessageSearch()}
      />

      <ColumnSettings
        getShowDialog={() => dialogs.showColumnSettingsModal}
        setShowDialog={dialogs.setShowColumnSettingsModal}
        topicName={topic.topicName}
      />

      <PreviewFieldsModal
        getShowDialog={() => dialogs.showPreviewFieldsModal}
        messages={messages}
        setShowDialog={dialogs.setShowPreviewFieldsModal}
        topicName={topic.topicName}
      />

      <DeserializersModal
        getShowDialog={() => dialogs.showDeserializersModal}
        keyDeserializer={query.keyDeserializer}
        schemaContext={query.schemaContext}
        setKeyDeserializer={query.setKeyDeserializer}
        setSchemaContext={query.setSchemaContext}
        setShowDialog={dialogs.setShowDeserializersModal}
        setValueDeserializer={query.setValueDeserializer}
        valueDeserializer={query.valueDeserializer}
      />
    </>
  );
}
