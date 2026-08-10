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

import type { PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { DownloadIcon, SettingsIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelSize } from 'react-resizable-panels';

import { DISPLAY_WINDOW_CAP } from './constants';
import { patchDetailViewState, readDetailViewState } from './detail/detail-view-state';
import { MessageDetailPanel } from './detail/message-detail-panel';
import { JsFilterDialog } from './dialogs/js-filter-dialog';
import { useClientFilters } from './hooks/use-client-filters';
import { useKeyboardNav } from './hooks/use-keyboard-nav';
import { type MessageSearchParams, messageKey, useMessageSearch } from './hooks/use-message-search';
import { useMessagesUrlState } from './hooks/use-messages-url-state';
import type { ValuePreviewConfig } from './table/message-cells';
import { MessagesFooter } from './table/messages-footer';
import { MessagesTable } from './table/messages-table';
import { FilterBar } from './toolbar/filter-bar';
import { MessagesToolbar } from './toolbar/messages-toolbar';
import { ReadScopeDocSheet } from './toolbar/read-scope-doc-sheet';
import { valuePaths } from './utils/client-match';
import { applyDisplayWindow } from './utils/live-window';
import { ViewSettingsPanel } from './view-settings/view-settings-panel';
import { isServerless } from '../../../../config';
import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { appGlobal } from '../../../../state/app-global';
import { useApiStoreHook } from '../../../../state/backend-api';
import type { Topic, TopicMessage } from '../../../../state/rest-interfaces';
import { type FilterEntry, PartitionOffsetOrigin } from '../../../../state/ui';
import { useTopicSettingsStore } from '../../../../stores/topic-settings-store';
import { sanitizeString, wrapFilterFragment } from '../../../../utils/filter-helper';
import { getTopicFilters, setTopicFilters } from '../../../../utils/topic-filters-session';
import { encodeBase64 } from '../../../../utils/utils';
import { SaveMessagesDialog } from '../Tab.Messages/dialogs/save-messages-dialog';

export type TopicMessagesViewProps = {
  topic: Topic;
};

/**
 * Redesigned topic messages viewer ("Console Messages UX").
 * Rendered behind the `enableNewTopicMessagesPage` feature flag.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page container wires url state, streaming and table state together
export const TopicMessagesView = ({ topic }: TopicMessagesViewProps) => {
  const topicName = topic.topicName;
  const urlState = useMessagesUrlState(topicName);
  const search = useMessageSearch(topicName);
  const { getRowDensity, getMessageColumns, getTopicSettings } = useTopicSettingsStore();

  const [docSheetOpen, setDocSheetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [readScopeOpen, setReadScopeOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Selection lives in the URL (`selected=partition-offset`) so reloads and
  // shared links reopen the detail once the message is loaded.
  const { selectedKey, setSelectedKey } = urlState;

  // Detail presentation is a persisted preference: whoever prefers the expanded
  // sheet gets it again for the next message and after reloads.
  const [detailExpanded, setDetailExpandedState] = useState<boolean>(() => readDetailViewState().expanded);
  const setDetailExpanded = useCallback((expanded: boolean) => {
    setDetailExpandedState(expanded);
    patchDetailViewState({ expanded });
  }, []);

  const handleDetailClose = useCallback(() => {
    setSelectedKey(null);
  }, [setSelectedKey]);

  // Docked panel width is a persisted preference too. A ref (not state) so
  // resize drags don't re-render the whole page; the panel reads it on mount.
  const detailPanelSizeRef = useRef(readDetailViewState().panelSizePct);
  const handleDetailPanelResize = useCallback((size: PanelSize) => {
    detailPanelSizeRef.current = size.asPercentage;
    patchDetailViewState({ panelSizePct: size.asPercentage });
  }, []);

  // Committed field-token filters live in the URL (`f`) so reloads and shared
  // links keep them; JS filters are deliberately excluded from the URL.
  const { fieldTokens, setFieldTokens } = urlState;
  // JavaScript push-down filters, persisted in sessionStorage per topic
  const [jsFilters, setJsFilters] = useState<FilterEntry[]>(() => getTopicFilters(topicName));
  const [jsDialog, setJsDialog] = useState<{ filter: FilterEntry | null; seedCode?: string; seedName?: string } | null>(
    null
  );

  useEffect(() => {
    setTopicFilters(topicName, jsFilters);
  }, [topicName, jsFilters]);

  // The toggle state persists across mode switches, but continuous pagination
  // only applies to the newest/oldest scopes (never to offset/timestamp or live).
  const continuousActive =
    urlState.continuousMode &&
    (urlState.readScopeMode === 'newest' || urlState.readScopeMode === 'oldest') &&
    !urlState.liveTail;

  const topicPermissions = useApiStoreHook((s) => s.topicPermissions.get(topicName));
  const canUseJsFilters = (topicPermissions?.canUseSearchFilters ?? true) && !isServerless() && !continuousActive;

  const density = getRowDensity(topicName);
  const columnConfig = getMessageColumns(topicName);
  const topicSettings = getTopicSettings(topicName);
  const timestampFormat = topicSettings?.previewTimestamps ?? 'default';

  const valuePreview: ValuePreviewConfig = useMemo(
    () => ({
      tags: topicSettings?.previewTags ?? [],
      caseSensitive: topicSettings?.previewTagsCaseSensitive === 'caseSensitive',
      multiResultMode: topicSettings?.previewMultiResultMode ?? 'showAll',
      displayMode: topicSettings?.previewDisplayMode ?? 'single',
    }),
    [
      topicSettings?.previewTags,
      topicSettings?.previewTagsCaseSensitive,
      topicSettings?.previewMultiResultMode,
      topicSettings?.previewDisplayMode,
    ]
  );

  const valuePathHints = useMemo(() => valuePaths(search.messages), [search.messages]);

  // Combine active JS filters into the base64 backend predicate (AND semantics)
  const filterInterpreterCode = useMemo(() => {
    if (!canUseJsFilters) {
      return '';
    }
    const active = jsFilters.filter((f) => f.isActive && f.code && f.transpiledCode);
    if (active.length === 0) {
      return '';
    }
    const functions = active.map((f, i) => `function filter${i + 1}() {\n${wrapFilterFragment(f.transpiledCode)}\n}`);
    const code = `${functions.join('\n\n')}\n\nreturn ${active.map((_, i) => `filter${i + 1}()`).join(' && ')}`;
    return encodeBase64(sanitizeString(code));
  }, [jsFilters, canUseJsFilters]);

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
      filterInterpreterCode,
    ]
  );

  // Auto-search on parameter change: 100ms debounce with a signature guard so
  // unrelated re-renders don't restart an identical stream (ported from legacy).
  const lastSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (urlState.liveTail) {
      return; // live tail owns the stream (P5)
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
    return () => clearTimeout(timer);
  }, [searchParams, refreshCounter, urlState.liveTail, search.start]);

  // Live tail: stream from the log's end; stopping restores the paged backlog
  // (clearing the signature lets the paged auto-search above re-run).
  useEffect(() => {
    if (!urlState.liveTail) {
      return;
    }
    lastSignatureRef.current = null;
    search
      .start({ ...searchParams, startOffset: PartitionOffsetOrigin.End, pageSize: undefined }, { live: true })
      .catch(() => {
        // errors are surfaced through search.error
      });
    return () => search.stop();
    // searchParams is intentionally not a dependency: scope edits are disabled while live,
    // and deserializer changes take effect on the next (re)start.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [urlState.liveTail, search.start, search.stop]);

  const filteredMessages = useClientFilters(search.messages, urlState.quickSearch, fieldTokens);

  // In continuous or live mode only the newest DISPLAY_WINDOW_CAP rows stay rendered
  const { rows: windowedMessages, trimmed } = useMemo(
    () =>
      continuousActive || urlState.liveTail
        ? applyDisplayWindow(filteredMessages, DISPLAY_WINDOW_CAP)
        : { rows: filteredMessages, trimmed: 0 },
    [filteredMessages, continuousActive, urlState.liveTail]
  );

  // Stable mutable copy for consumers typed as TopicMessage[] — a fresh array on
  // every render would defeat react-table's data memoization.
  const tableData = useMemo(() => [...windowedMessages], [windowedMessages]);

  const isSearching = search.phase === 'connecting' || search.phase === 'searching';

  const pagination: PaginationState = useMemo(
    () => ({
      pageIndex: urlState.pageIndex,
      pageSize: continuousActive ? Math.max(windowedMessages.length, 1) : urlState.pageSize,
    }),
    [urlState.pageIndex, urlState.pageSize, continuousActive, windowedMessages.length]
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

  // Row clicks always select (mock behavior) — switching rows swaps the open
  // detail (docked or expanded) in place; closing is the panel's own X.
  const handleRowClick = useCallback(
    (msg: TopicMessage) => {
      // Detail and view settings are distinct right-side surfaces — one at a time
      setViewSettingsOpen(false);
      setSelectedKey(messageKey(msg));
    },
    [setSelectedKey]
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

  const handleRefresh = useCallback(() => {
    if (urlState.liveTail) {
      return;
    }
    setRefreshCounter((c) => c + 1);
  }, [urlState.liveTail]);

  // DeleteRecordsModal (and other page-level actions) re-trigger the search through this global
  useEffect(() => {
    appGlobal.searchMessagesFunc = () => setRefreshCounter((c) => c + 1);
    return () => {
      appGlobal.searchMessagesFunc = undefined;
    };
  }, []);

  // Keyboard nav follows the on-screen order: current sort, then current page
  const visibleKeys = useMemo(() => {
    const sorted = [...windowedMessages].sort((a, b) => {
      for (const sort of urlState.sorting) {
        const direction = sort.desc ? -1 : 1;
        const left = sort.id === 'timestamp' ? a.timestamp : a.offset;
        const right = sort.id === 'timestamp' ? b.timestamp : b.offset;
        if (left !== right) {
          return left < right ? -direction : direction;
        }
      }
      return 0;
    });
    const start = pagination.pageIndex * pagination.pageSize;
    return sorted.slice(start, start + pagination.pageSize).map(messageKey);
  }, [windowedMessages, urlState.sorting, pagination]);

  const getCopyText = useCallback(
    (key: string) => search.messages.find((m) => messageKey(m) === key)?.valueJson,
    [search.messages]
  );

  useKeyboardNav({
    visibleKeys,
    selectedKey,
    onSelect: setSelectedKey,
    getCopyText,
    enabled: !(saveDialogOpen || jsDialog || viewSettingsOpen || docSheetOpen || readScopeOpen),
  });

  return (
    <div className="flex flex-col gap-4" data-testid="topic-messages-view">
      <MessagesToolbar
        filterSlot={
          <FilterBar
            canUseJsFilters={canUseJsFilters}
            fieldTokens={fieldTokens}
            jsFilters={jsFilters.filter((f) => f.isActive)}
            messages={search.messages}
            onEditJsFilter={(filter, seedCode, seedName) => setJsDialog({ filter, seedCode, seedName })}
            onFieldTokensChange={setFieldTokens}
            onPartitionIdChange={(partitionId) => {
              urlState.setPartitionId(partitionId);
              urlState.setPageIndex(0);
            }}
            onQuickSearchChange={urlState.setQuickSearch}
            onRemoveJsFilter={(id) => setJsFilters((prev) => prev.filter((f) => f.id !== id))}
            partitionId={urlState.partitionId}
            quickSearch={urlState.quickSearch}
          />
        }
        isLive={urlState.liveTail}
        isRefreshing={isSearching}
        onRefresh={handleRefresh}
        scopeProps={{
          topicName,
          mode: urlState.readScopeMode,
          onModeChange: urlState.setReadScopeMode,
          customOffset: urlState.startOffset >= 0 ? urlState.startOffset : -1,
          onCustomOffsetChange: (offset) => {
            urlState.setStartOffset(offset);
            urlState.setPageIndex(0);
          },
          startTimestamp: urlState.startTimestamp,
          onStartTimestampChange: (timestamp) => {
            urlState.setStartTimestamp(timestamp);
            urlState.setStartOffset(PartitionOffsetOrigin.Timestamp);
            urlState.setPageIndex(0);
          },
          maxResults: urlState.maxResults,
          onMaxResultsChange: (maxResults) => {
            urlState.setMaxResults(maxResults);
            urlState.setPageIndex(0);
          },
          continuousMode: urlState.continuousMode,
          onContinuousModeChange: (enabled) => {
            urlState.setContinuousMode(enabled);
            // Continuous mode's page holds every loaded row in one page (see
            // messages-table.tsx) — staying on a later pageIndex than that yields a
            // permanently blank table with no page controls to get back with.
            urlState.setPageIndex(0);
          },
          partitionId: urlState.partitionId,
          onPartitionIdChange: (partitionId) => {
            urlState.setPartitionId(partitionId);
            urlState.setPageIndex(0);
          },
          partitionCount: topic.partitionCount,
          liveTail: urlState.liveTail,
          onLiveTailChange: (enabled) => {
            setSelectedKey(null);
            if (enabled) {
              urlState.setReadScopeMode('newest');
              urlState.setPageIndex(0);
            }
            urlState.setLiveTail(enabled);
          },
          onOpenDocs: () => setDocSheetOpen(true),
          onOpenChange: setReadScopeOpen,
        }}
      />

      <ResizablePanelGroup className="items-stretch">
        <ResizablePanel minSize="40%">
          <div className="relative">
            <div className="absolute top-1 right-2 z-10 flex items-center gap-0.5 rounded-lg bg-card p-0.5">
              <Button
                onClick={() => setSaveDialogOpen(true)}
                size="sm"
                testId="messages-save-button"
                title="Save messages — export as JSON or CSV"
                variant="ghost"
              >
                <DownloadIcon className="size-3.5" />
              </Button>
              <Button
                onClick={() => {
                  const opening = !viewSettingsOpen;
                  if (opening) {
                    handleDetailClose();
                  }
                  setViewSettingsOpen(opening);
                }}
                size="sm"
                testId="messages-view-settings-button"
                title="View settings — decoding, columns, format & preview fields"
                variant={viewSettingsOpen ? 'secondary' : 'ghost'}
              >
                <SettingsIcon className="size-3.5" />
              </Button>
            </div>
            <MessagesTable
              columnConfig={columnConfig}
              density={density}
              hasActiveFilter={
                urlState.quickSearch.trim().length > 0 || fieldTokens.length > 0 || filterInterpreterCode !== ''
              }
              isLiveWaiting={urlState.liveTail && search.messages.length === 0}
              isLoading={isSearching && !urlState.liveTail}
              messages={tableData}
              newKeys={search.newKeys}
              onPaginationChange={handlePaginationChange}
              onRowClick={handleRowClick}
              onSortingChange={handleSortingChange}
              pagination={pagination}
              selectedKey={selectedKey}
              sorting={urlState.sorting}
              sortingDisabled={continuousActive}
              timestampFormat={timestampFormat}
              valuePreview={valuePreview}
            />
          </div>
        </ResizablePanel>
        {selectedMessage && !detailExpanded && (
          <>
            <ResizableHandle className="mx-1.5" withHandle />
            <ResizablePanel
              defaultSize={`${detailPanelSizeRef.current}%`}
              maxSize="55%"
              minSize="20%"
              onResize={handleDetailPanelResize}
            >
              <MessageDetailPanel
                expanded={false}
                loadLargeMessage={handleLoadLargeMessage}
                msg={selectedMessage}
                onClose={handleDetailClose}
                onExpandedChange={setDetailExpanded}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Expanded presentation replaces the docked slot entirely (sheet portals to body) */}
      {selectedMessage && detailExpanded && (
        <MessageDetailPanel
          expanded
          loadLargeMessage={handleLoadLargeMessage}
          msg={selectedMessage}
          onClose={handleDetailClose}
          onExpandedChange={setDetailExpanded}
        />
      )}

      <MessagesFooter
        bytesConsumed={search.bytesConsumed}
        canLoadMore={continuousActive && search.nextPageToken !== null}
        continuousMode={continuousActive}
        elapsedMs={search.elapsedMs}
        isLoadingMore={search.isLoadingMore}
        loadMoreCount={urlState.maxResults}
        onLoadMore={() => search.loadMore(urlState.maxResults)}
        onPageChange={urlState.setPageIndex}
        pageIndex={urlState.pageIndex}
        pageSize={urlState.pageSize}
        showStats={!(urlState.liveTail || isSearching)}
        totalLoaded={filteredMessages.length}
        trimmedCount={trimmed}
        windowCap={DISPLAY_WINDOW_CAP}
        windowSize={windowedMessages.length}
      />

      {viewSettingsOpen && (
        <aside
          className="slide-in-from-right fixed inset-y-0 right-0 z-40 flex w-[372px] max-w-[90vw] animate-in flex-col border-l bg-card shadow-xl duration-200"
          data-testid="view-settings-sidebar"
        >
          <ViewSettingsPanel
            keyDeserializer={urlState.keyDeserializer}
            onClose={() => setViewSettingsOpen(false)}
            onKeyDeserializerChange={urlState.setKeyDeserializer}
            onResetDeserializers={() => {
              urlState.setKeyDeserializer(PayloadEncoding.UNSPECIFIED);
              urlState.setValueDeserializer(PayloadEncoding.UNSPECIFIED);
            }}
            onValueDeserializerChange={urlState.setValueDeserializer}
            topicName={topicName}
            valueDeserializer={urlState.valueDeserializer}
            valuePathHints={valuePathHints}
          />
        </aside>
      )}

      <ReadScopeDocSheet
        liveTail={urlState.liveTail}
        mode={urlState.readScopeMode}
        onOpenChange={setDocSheetOpen}
        open={docSheetOpen}
      />
      {jsDialog && (
        <JsFilterDialog
          filter={jsDialog.filter}
          onClose={() => setJsDialog(null)}
          onSave={(saved) =>
            setJsFilters((prev) =>
              prev.some((f) => f.id === saved.id) ? prev.map((f) => (f.id === saved.id ? saved : f)) : [...prev, saved]
            )
          }
          seedCode={jsDialog.seedCode}
          seedName={jsDialog.seedName}
        />
      )}
      {saveDialogOpen && (
        <SaveMessagesDialog
          messages={tableData}
          onClose={() => setSaveDialogOpen(false)}
          onRequireRawPayload={() => Promise.resolve(tableData)}
        />
      )}
    </div>
  );
};
