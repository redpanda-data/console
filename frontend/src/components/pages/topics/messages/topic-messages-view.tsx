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

import { ElementTooltip } from 'components/misc/element-tooltip';
import { Button } from 'components/redpanda-ui/components/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { DownloadIcon, SettingsIcon } from 'lucide-react';

import { DISPLAY_WINDOW_CAP } from './constants';
import { MessageDetailPanel } from './detail/message-detail-panel';
import { JsFilterDialog } from './dialogs/js-filter-dialog';
import { useTopicMessagesPage } from './hooks/use-topic-messages-page';
import { MessagesFooter } from './table/messages-footer';
import { MessagesTable } from './table/messages-table';
import { FilterBar } from './toolbar/filter-bar';
import { MessagesToolbar } from './toolbar/messages-toolbar';
import { ReadScopeDocSheet } from './toolbar/read-scope-doc-sheet';
import { visibleJsFilters } from './utils/js-filters';
import { ViewSettingsPanel } from './view-settings/view-settings-panel';
import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { Topic } from '../../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../../state/ui';
import { SaveMessagesDialog } from '../Tab.Messages/dialogs/save-messages-dialog';

export type TopicMessagesViewProps = {
  topic: Topic;
};

/**
 * Redesigned topic messages viewer ("Console Messages UX").
 * Rendered behind the `enableNewTopicMessagesPage` feature flag.
 */
export const TopicMessagesView = ({ topic }: TopicMessagesViewProps) => {
  const { urlState, search, surfaces, detail, jsFilters, query, runner, table, viewSettings, isSearching } =
    useTopicMessagesPage(topic);

  return (
    <div className="flex flex-col gap-4" data-testid="topic-messages-view">
      <MessagesToolbar
        filterSlot={
          <FilterBar
            canUseJsFilters={query.canUseJsFilters}
            fieldTokens={urlState.fieldTokens}
            jsFilters={visibleJsFilters(jsFilters.jsFilters, query.canUseJsFilters)}
            messages={search.messages}
            onEditJsFilter={(filter, seedCode, seedName) => jsFilters.setJsDialog({ filter, seedCode, seedName })}
            onFieldTokensChange={(tokens) => {
              urlState.setFieldTokens(tokens);
              urlState.setPageIndex(0);
            }}
            onPartitionIdChange={(partitionId) => {
              urlState.setPartitionId(partitionId);
              urlState.setPageIndex(0);
            }}
            onQuickSearchChange={(value) => {
              urlState.setQuickSearch(value);
              urlState.setPageIndex(0);
            }}
            onRemoveJsFilter={(id) => jsFilters.setJsFilters((prev) => prev.filter((f) => f.id !== id))}
            partitionCount={topic.partitionCount}
            partitionId={urlState.partitionId}
            quickSearch={urlState.quickSearch}
          />
        }
        isLive={urlState.liveTail && runner.liveTailStatus !== 'exhausted'}
        isRefreshing={isSearching}
        onRefresh={runner.handleRefresh}
        scopeProps={{
          topicName: topic.topicName,
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
            urlState.setSelectedKey(null);
            if (enabled) {
              urlState.setReadScopeMode('newest');
              urlState.setPageIndex(0);
            }
            urlState.setLiveTail(enabled);
          },
          onOpenDocs: () => surfaces.setDocSheetOpen(true),
          onOpenChange: surfaces.setReadScopeOpen,
        }}
      />

      <ResizablePanelGroup className="items-stretch">
        <ResizablePanel minSize="40%">
          <div className="relative" ref={detail.fallbackFocusRef} tabIndex={-1}>
            <div className="absolute top-1 right-2 z-10 flex items-center gap-0.5 rounded-lg bg-card p-0.5">
              <ElementTooltip content="Save messages — export as JSON or CSV">
                <Button
                  aria-label="Save messages — export as JSON or CSV"
                  onClick={() => surfaces.setSaveDialogOpen(true)}
                  size="sm"
                  testId="messages-save-button"
                  variant="ghost"
                >
                  <DownloadIcon className="size-3.5" />
                </Button>
              </ElementTooltip>
              <ElementTooltip content="View settings — decoding, columns, format & preview fields">
                <Button
                  aria-label="View settings — decoding, columns, format & preview fields"
                  onClick={() => {
                    const opening = !surfaces.viewSettingsOpen;
                    if (opening) {
                      detail.handleDetailClose();
                    }
                    surfaces.setViewSettingsOpen(opening);
                  }}
                  size="sm"
                  testId="messages-view-settings-button"
                  variant={surfaces.viewSettingsOpen ? 'default' : 'ghost'}
                >
                  <SettingsIcon className="size-3.5" />
                </Button>
              </ElementTooltip>
            </div>
            <MessagesTable
              columnConfig={viewSettings.columnConfig}
              density={viewSettings.density}
              error={search.error?.message ?? null}
              hasActiveFilter={
                urlState.quickSearch.trim().length > 0 ||
                urlState.fieldTokens.length > 0 ||
                query.filterInterpreterCode !== ''
              }
              isLiveWaiting={urlState.liveTail && search.messages.length === 0}
              isLoading={isSearching && !urlState.liveTail}
              messages={table.tableData}
              newKeys={search.newKeys}
              onPaginationChange={table.handlePaginationChange}
              onRetry={runner.handleRefresh}
              onRowClick={table.handleRowClick}
              onSortingChange={table.handleSortingChange}
              pagination={table.pagination}
              selectedKey={urlState.selectedKey}
              sorting={urlState.sorting}
              sortingDisabled={query.continuousActive}
              timestampFormat={viewSettings.timestampFormat}
              valuePreview={viewSettings.valuePreview}
            />
          </div>
        </ResizablePanel>
        {table.selectedMessage && !detail.detailExpanded && (
          <>
            <ResizableHandle className="mx-1.5" withHandle />
            <ResizablePanel
              defaultSize={`${detail.detailPanelSizeRef.current}%`}
              maxSize="55%"
              minSize="20%"
              onResize={detail.handleDetailPanelResize}
            >
              <MessageDetailPanel
                expandButtonRef={detail.expandButtonRef}
                expanded={false}
                fallbackFocusRef={detail.fallbackFocusRef}
                loadLargeMessage={table.handleLoadLargeMessage}
                msg={table.selectedMessage}
                onClose={detail.handleDetailClose}
                onExpandedChange={detail.setDetailExpanded}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Expanded presentation replaces the docked slot entirely (fixed full-viewport overlay) */}
      {table.selectedMessage && detail.detailExpanded && (
        <MessageDetailPanel
          expandButtonRef={detail.expandButtonRef}
          expanded
          fallbackFocusRef={detail.fallbackFocusRef}
          loadLargeMessage={table.handleLoadLargeMessage}
          msg={table.selectedMessage}
          onClose={detail.handleDetailClose}
          onExpandedChange={detail.setDetailExpanded}
        />
      )}

      <MessagesFooter
        bytesConsumed={search.bytesConsumed}
        canLoadMore={query.continuousActive && search.nextPageToken !== null}
        continuousMode={query.continuousActive}
        elapsedMs={search.elapsedMs}
        isLoadingMore={search.isLoadingMore}
        loadMoreCount={urlState.maxResults}
        onLoadMore={() =>
          search.loadMore(urlState.maxResults).catch(() => {
            // errors are surfaced through search.error
          })
        }
        onPageChange={urlState.setPageIndex}
        pageIndex={urlState.pageIndex}
        pageSize={urlState.pageSize}
        showStats={!(urlState.liveTail || isSearching)}
        totalLoaded={table.filteredMessages.length}
        trimmedCount={table.trimmed}
        trimmedSide={table.continuousNewest ? 'newer' : 'older'}
        windowCap={DISPLAY_WINDOW_CAP}
        windowSize={table.windowedMessages.length}
      />

      {surfaces.viewSettingsOpen && (
        <aside
          className="fixed inset-y-0 right-0 z-40 flex w-[372px] max-w-[90vw] animate-in flex-col border-l bg-card shadow-xl duration-200 slide-in-from-right"
          data-testid="view-settings-sidebar"
        >
          <ViewSettingsPanel
            keyDeserializer={urlState.keyDeserializer}
            liveTail={urlState.liveTail}
            onClose={() => surfaces.setViewSettingsOpen(false)}
            onKeyDeserializerChange={urlState.setKeyDeserializer}
            onResetDeserializers={() => {
              urlState.setKeyDeserializer(PayloadEncoding.UNSPECIFIED);
              urlState.setValueDeserializer(PayloadEncoding.UNSPECIFIED);
              urlState.setSchemaContext('');
            }}
            onSchemaContextChange={urlState.setSchemaContext}
            onValueDeserializerChange={urlState.setValueDeserializer}
            schemaContext={urlState.schemaContext}
            topicName={topic.topicName}
            valueDeserializer={urlState.valueDeserializer}
            valuePathHints={viewSettings.valuePathHints}
          />
        </aside>
      )}

      <ReadScopeDocSheet
        liveTail={urlState.liveTail}
        mode={urlState.readScopeMode}
        onOpenChange={surfaces.setDocSheetOpen}
        open={surfaces.docSheetOpen}
      />
      {jsFilters.jsDialog && (
        <JsFilterDialog
          filter={jsFilters.jsDialog.filter}
          onClose={() => jsFilters.setJsDialog(null)}
          onSave={(saved) =>
            jsFilters.setJsFilters((prev) =>
              prev.some((f) => f.id === saved.id) ? prev.map((f) => (f.id === saved.id ? saved : f)) : [...prev, saved]
            )
          }
          seedCode={jsFilters.jsDialog.seedCode}
          seedName={jsFilters.jsDialog.seedName}
        />
      )}
      {surfaces.saveDialogOpen && (
        <SaveMessagesDialog
          messages={table.filteredMessages}
          onClose={() => surfaces.setSaveDialogOpen(false)}
          onRequireRawPayload={() => Promise.resolve(table.filteredMessages)}
        />
      )}
    </div>
  );
};
