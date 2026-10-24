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
  CalendarIcon,
  CodeIcon,
  DownloadIcon,
  ErrorIcon,
  InfoIcon,
  LayersIcon,
  PlayIcon,
  RefreshIcon,
  ReplyIcon,
  SettingsIcon,
  SkipBackIcon,
  TabIcon,
  TimerIcon,
} from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import type React from 'react';
import { type FC, useId, useState } from 'react';

import { MessageSearchFilterBar } from './common/message-search-filter-bar';
import { StartOffsetDateTimePicker } from './forms/start-offset-date-time-picker';
import type { MessageSearchController } from './hooks/use-message-search';
import type {
  MessagePagingParams,
  MessageQueryParams,
  MessageViewDialogs,
  TopicViewSettings,
} from './hooks/use-message-view-params';
import JavascriptFilterModal from './javascript-filter-modal';
import { isServerless } from '../../../../config';
import { useApiStoreHook } from '../../../../state/backend-api';
import type { Topic } from '../../../../state/rest-interfaces';
import {
  createFilterEntry,
  DEFAULT_SEARCH_PARAMS,
  type FilterEntry,
  PartitionOffsetOrigin,
  type PartitionOffsetOriginType,
} from '../../../../state/ui';
import { Label, StatusIndicator } from '../../../../utils/tsx-utils';
import { prettyBytes, prettyMilliseconds } from '../../../../utils/utils';
import { range } from '../../../misc/common';
import RemovableFilter from '../../../misc/removable-filter';

function getOffsetOrigin(startOffset: number): PartitionOffsetOriginType {
  return (startOffset >= 0 ? PartitionOffsetOrigin.Custom : startOffset) as PartitionOffsetOriginType;
}

// Continuous pagination is only available with Newest or Beginning start offsets.
function supportsContinuousPagination(origin: PartitionOffsetOriginType): boolean {
  return origin === PartitionOffsetOrigin.EndMinusResults || origin === PartitionOffsetOrigin.Start;
}

// The start offset for a newly chosen origin; choosing Offset keeps a custom offset already set.
function nextStartOffset(origin: PartitionOffsetOriginType, startOffset: number): number | undefined {
  if (origin === PartitionOffsetOrigin.Custom) {
    return startOffset < 0 ? 0 : undefined;
  }
  return origin;
}

// The timestamp for a newly chosen origin: now when switching TO Timestamp mode (unless one is set),
// and cleared from the URL when switching away from Timestamp.
function nextStartTimestamp(origin: PartitionOffsetOriginType, startTimestamp: number): number | null | undefined {
  if (origin === PartitionOffsetOrigin.Timestamp) {
    return startTimestamp === -1 ? Date.now() : undefined;
  }
  return null;
}

function buildStartOffsetOptions(continuousPaginationEnabled: boolean, maxResults: number) {
  return [
    {
      value: PartitionOffsetOrigin.End,
      label: (
        <div className="flex items-center gap-2">
          <PlayIcon />
          <span data-testid="start-offset-latest-live">Latest / Live</span>
        </div>
      ),
    },
    {
      value: PartitionOffsetOrigin.EndMinusResults,
      label: (
        <div className="flex items-center gap-2">
          <ReplyIcon />
          <span data-testid="start-offset-newest">
            {continuousPaginationEnabled ? 'Newest' : `Newest - ${String(maxResults)}`}
          </span>
        </div>
      ),
    },
    {
      value: PartitionOffsetOrigin.Start,
      label: (
        <div className="flex items-center gap-2">
          <SkipBackIcon />
          <span data-testid="start-offset-beginning">Beginning</span>
        </div>
      ),
    },
    {
      value: PartitionOffsetOrigin.Custom,
      label: (
        <div className="flex items-center gap-2">
          <TabIcon />
          <span data-testid="start-offset-custom">Offset</span>
        </div>
      ),
    },
    {
      value: PartitionOffsetOrigin.Timestamp,
      label: (
        <div className="flex items-center gap-2">
          <CalendarIcon />
          <span data-testid="start-offset-timestamp">Timestamp</span>
        </div>
      ),
    },
  ];
}

type ParamsProps = { query: MessageQueryParams; paging: MessagePagingParams };

function StartOffsetControl({ topicName, query, paging }: ParamsProps & { topicName: string }) {
  const { startOffset, setStartOffset, startTimestamp, setStartTimestamp, maxResults } = query;
  const [customStartOffsetValue, setCustomStartOffsetValue] = useState<number | string>(0);

  // Page resets live in the setters, not in effects watching the URL: navigating away briefly
  // renders this view with the next route's (empty) search, and an effect reacting to that
  // queues a nuqs update that navigates back to this topic (UX-1514).
  const changeStartOffset = (value: number) => {
    if (value !== startOffset) {
      paging.setPageIndex(0);
    }
    setStartOffset(value);
  };

  const currentOffsetOrigin = getOffsetOrigin(startOffset);
  const startOffsetOptions = buildStartOffsetOptions(paging.continuousPaginationEnabled, maxResults);
  const customStartOffsetValid = !Number.isNaN(Number(customStartOffsetValue));

  return (
    <Label text="Start Offset">
      <div className="flex gap-3">
        <Select
          onValueChange={(val) => {
            const e = Number(val) as PartitionOffsetOriginType;
            const offset = nextStartOffset(e, startOffset);
            if (offset !== undefined) {
              changeStartOffset(offset);
            }

            // Auto-disable continuous pagination for unsupported offsets
            if (paging.continuousPaginationEnabled && !supportsContinuousPagination(e)) {
              paging.setContinuousPaginationEnabled(false);
            }

            // Handle timestamp parameter in URL
            const timestamp = nextStartTimestamp(e, startTimestamp);
            if (timestamp !== undefined) {
              setStartTimestamp(timestamp);
            }
          }}
          value={String(currentOffsetOrigin)}
        >
          <SelectTrigger testId="start-offset-dropdown">
            <SelectValue>
              {(value: unknown) => startOffsetOptions.find((o) => String(o.value) === String(value))?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {startOffsetOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentOffsetOrigin === PartitionOffsetOrigin.Custom && (
          <TooltipProvider>
            <Tooltip open={!customStartOffsetValid}>
              <TooltipTrigger
                render={
                  <Input
                    disabled={currentOffsetOrigin !== PartitionOffsetOrigin.Custom}
                    maxLength={20}
                    onChange={(e) => {
                      setCustomStartOffsetValue(e.target.value);
                      if (!Number.isNaN(Number(e.target.value))) {
                        changeStartOffset(Number(e.target.value));
                      }
                    }}
                    style={{ width: '7.5em' }}
                    value={customStartOffsetValue}
                  />
                }
              />
              <TooltipContent side="right">Offset must be a number</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {currentOffsetOrigin === PartitionOffsetOrigin.Timestamp && (
          <StartOffsetDateTimePicker onChange={setStartTimestamp} topicName={topicName} value={startTimestamp} />
        )}
      </div>
    </Label>
  );
}

function MaxResultsControl({ query, paging }: ParamsProps) {
  const { maxResults, setMaxResults } = query;
  const changeMaxResults = (value: number) => {
    if (value !== maxResults) {
      paging.setPageIndex(0);
    }
    setMaxResults(value);
  };

  return (
    <Label text="Max Results">
      <Select
        data-testid="max-results-select"
        onValueChange={(val) => changeMaxResults(Number(val))}
        value={String(maxResults)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 10_000].map((i) => (
            <SelectItem key={i} value={String(i)}>
              {i.toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}

function ContinuousPaginationControl({ paging, startOffset }: { paging: MessagePagingParams; startOffset: number }) {
  const continuousPaginationDisabled = !supportsContinuousPagination(getOffsetOrigin(startOffset));
  const controlId = useId();

  return (
    <Label
      htmlFor={controlId}
      style={{}}
      text="Continuous Pagination"
      textSuffix={
        <Tooltip>
          <TooltipTrigger
            render={
              <span style={{ display: 'inline-flex', verticalAlign: 'text-top', cursor: 'pointer' }}>
                <InfoIcon size={11} />
              </span>
            }
          />
          <TooltipContent side="top">
            {continuousPaginationDisabled
              ? 'Continuous pagination is only available with Newest or Beginning start offsets'
              : 'Continuously load more messages as you page forward through the topic. Only the most recent pages are kept in memory.'}
          </TooltipContent>
        </Tooltip>
      }
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <Switch
          checked={paging.continuousPaginationEnabled}
          data-testid="continuous-pagination-toggle"
          disabled={continuousPaginationDisabled}
          id={controlId}
          onCheckedChange={(checked) => paging.setContinuousPaginationEnabled(checked)}
        />
      </div>
    </Label>
  );
}

/**
 * A dropdown menu item for the "Add filter" menu. When `disabledReason` is set the item
 * renders as a visually-disabled row that shows a tooltip explaining why on hover.
 *
 * We deliberately do NOT render a disabled `<DropdownMenuItem>` here: Base UI wraps every
 * menu item in a `MotionHighlight` layer that keeps intercepting pointer events even when
 * the item is disabled, so a tooltip attached to a wrapping element never receives hover.
 * Rendering the disabled state as a plain styled `<span>` (mirroring the menu-item styling)
 * lets the tooltip trigger receive hover reliably while the row stays non-interactive.
 */
const AddFilterMenuItem: FC<{
  testId: string;
  disabledReason?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ testId, disabledReason, onClick, children }) => {
  if (!disabledReason) {
    return (
      <DropdownMenuItem data-testid={testId} onClick={onClick}>
        {children}
      </DropdownMenuItem>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-disabled
              className="relative flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-body opacity-50 select-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground"
              data-testid={testId}
              role="menuitem"
              tabIndex={-1}
            >
              {children}
            </span>
          }
        />
        <TooltipContent side="right">{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Why a JavaScript filter cannot be added (undefined = enabled).
function getJsFilterDisabledReason(canUseSearchFilters: boolean, continuousPaginationEnabled: boolean) {
  if (isServerless()) {
    return 'JavaScript filters are not available in Serverless clusters.';
  }
  if (!canUseSearchFilters) {
    return "You don't have permission to use search filters on this topic.";
  }
  if (continuousPaginationEnabled) {
    return 'JavaScript filters are not available while continuous pagination is enabled. Turn it off to add a filter.';
  }
}

function AddFilterMenu({
  topicName,
  settings,
  continuousPaginationEnabled,
  onAddJavascriptFilter,
}: {
  topicName: string;
  settings: TopicViewSettings;
  continuousPaginationEnabled: boolean;
  onAddJavascriptFilter: (filter: FilterEntry) => void;
}) {
  const topicPermissions = useApiStoreHook((s) => s.topicPermissions.get(topicName));

  // Reasons explaining why a filter cannot be added (undefined = enabled).
  const partitionFilterDisabledReason = settings.dynamicFilters.includes('partition')
    ? 'Partition filter is already added. Use the existing Partition control to filter, or remove it first.'
    : undefined;

  return (
    <div className="flex items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button data-testid="add-topic-filter" variant="outline">
              Add filter
            </Button>
          }
        />
        <DropdownMenuContent>
          <AddFilterMenuItem
            disabledReason={partitionFilterDisabledReason}
            onClick={() => settings.addDynamicFilter('partition')}
            testId="add-topic-filter-partition"
          >
            <LayersIcon size="1.5rem" /> Partition
          </AddFilterMenuItem>
          <DropdownMenuSeparator />
          <AddFilterMenuItem
            disabledReason={getJsFilterDisabledReason(
              topicPermissions?.canUseSearchFilters ?? true,
              continuousPaginationEnabled
            )}
            onClick={() => {
              const filter = createFilterEntry();
              onAddJavascriptFilter(filter);
            }}
            testId="add-topic-filter-javascript"
          >
            <CodeIcon size="1.5rem" /> JavaScript Filter
          </AddFilterMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MessageSettingsMenu({ dialogs }: { dialogs: MessageViewDialogs }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-testid="message-settings-button" size="icon" variant="outline">
            <SettingsIcon size="1.5rem" />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem
          data-testid="deserialization-settings-menu-item"
          onClick={() => dialogs.setShowDeserializersModal(true)}
        >
          Deserialization
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="column-settings-menu-item"
          onClick={() => dialogs.setShowColumnSettingsModal(true)}
        >
          Column settings
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="preview-fields-menu-item"
          onClick={() => dialogs.setShowPreviewFieldsModal(true)}
        >
          Preview fields
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchActionButton({ search }: { search: MessageSearchController }) {
  return (
    <div className="flex items-end">
      {/* Refresh Button */}
      {search.searchPhase === null && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Repeat current search"
                  data-testid="refresh-messages-button"
                  onClick={() => search.searchFunc('manual')}
                  size="icon"
                  variant="outline"
                >
                  <RefreshIcon />
                </Button>
              }
            />
            <TooltipContent side="top">Repeat current search</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {search.searchPhase !== null && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Stop searching"
                  data-testid="stop-search-button"
                  onClick={() => {
                    if (search.abortControllerRef.current) {
                      search.abortControllerRef.current.abort();
                    }
                  }}
                  size="icon"
                  variant="destructive"
                >
                  <ErrorIcon />
                </Button>
              }
            />
            <TooltipContent side="top">Stop searching</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function QuickSearchRow({
  quickSearch,
  setQuickSearch,
  search,
}: {
  quickSearch: string;
  setQuickSearch: (value: string) => void;
  search: MessageSearchController;
}) {
  return (
    <div className="col-span-full mt-4 flex gap-4">
      {/* Quick Search */}
      <Input
        data-testid="message-quick-search-input"
        onChange={(x) => {
          setQuickSearch(x.target.value);
        }}
        placeholder="Filter table content ..."
        value={quickSearch}
      />
      <div className="flex items-end gap-2 text-body whitespace-nowrap">
        {search.searchPhase === null || search.searchPhase === 'Done' ? (
          <>
            <div className="flex items-center gap-2">
              <DownloadIcon size={14} /> {prettyBytes(search.bytesConsumed)}
            </div>
            <div className="flex items-center gap-2">
              <TimerIcon size={14} /> {search.elapsedMs ? prettyMilliseconds(search.elapsedMs) : ''}
            </div>
          </>
        ) : (
          <>
            <span className="spinner" />
            <span className="pulsating">Fetching data...</span>
          </>
        )}
      </div>
    </div>
  );
}

type MessageSearchControlsProps = ParamsProps & {
  topic: Topic;
  settings: TopicViewSettings;
  filters: FilterEntry[];
  setFilters: (filters: FilterEntry[]) => void;
  quickSearch: string;
  setQuickSearch: (value: string) => void;
  search: MessageSearchController;
  dialogs: MessageViewDialogs;
};

/** The search toolbar: start offset, result limit, filters, settings, quick search, and search progress. */
export function MessageSearchControls(props: MessageSearchControlsProps) {
  const { topic, query, paging, settings, filters, setFilters, search } = props;
  const [currentJSFilter, setCurrentJSFilter] = useState<FilterEntry | null>(null);
  const { messages, totalLoadedCount } = search.searchState;

  return (
    <>
      <div className="my-4 grid w-full grid-cols-[auto_1fr] gap-3">
        <div className="col-span-full flex gap-3 md:col-auto">
          <StartOffsetControl paging={paging} query={query} topicName={topic.topicName} />
          <MaxResultsControl paging={paging} query={query} />
          <ContinuousPaginationControl paging={paging} startOffset={query.startOffset} />

          {settings.dynamicFilters.map(
            (filter) =>
              ({
                partition: (
                  <Label text="Partition">
                    <RemovableFilter
                      onRemove={() => {
                        settings.removeDynamicFilter('partition');
                        query.setPartitionID(DEFAULT_SEARCH_PARAMS.partitionID);
                      }}
                    >
                      <Select
                        onValueChange={(val) => query.setPartitionID(Number(val))}
                        value={String(query.partitionID)}
                      >
                        <SelectTrigger testId="partition-filter-dropdown">
                          <SelectValue>
                            {(value: unknown) => (String(value) === '-1' ? 'All' : String(value))}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">All</SelectItem>
                          {range(0, topic.partitionCount).map((i) => (
                            <SelectItem key={i} value={String(i)}>
                              {i}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </RemovableFilter>
                  </Label>
                ),
              })[filter]
          )}

          <AddFilterMenu
            continuousPaginationEnabled={paging.continuousPaginationEnabled}
            onAddJavascriptFilter={setCurrentJSFilter}
            settings={settings}
            topicName={topic.topicName}
          />

          {/* Search Progress Indicator: "Consuming Messages 30/30" */}
          {Boolean(search.searchPhase && search.searchPhase.length > 0) && (
            <StatusIndicator
              bytesConsumed={prettyBytes(search.bytesConsumed)}
              fillFactor={paging.continuousPaginationEnabled ? 0 : messages.length / query.maxResults}
              identityKey="messageSearch"
              messagesConsumed={String(search.totalMessagesConsumed)}
              progressText={
                paging.continuousPaginationEnabled && totalLoadedCount > messages.length
                  ? `${messages.length} / ${totalLoadedCount} loaded`
                  : `${messages.length} / ${query.maxResults}`
              }
              // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
              statusText={search.searchPhase!}
            />
          )}
        </div>

        <div className="flex items-end justify-end gap-3">
          <MessageSettingsMenu dialogs={props.dialogs} />
          <SearchActionButton search={search} />
        </div>

        {/* Filter Tags */}
        <MessageSearchFilterBar
          filters={filters}
          onEdit={(filter) => {
            setCurrentJSFilter(filter);
          }}
          onRemove={(filterId) => {
            setFilters(filters.filter((f) => f.id !== filterId));
          }}
          onToggle={(filterId) => {
            setFilters(filters.map((f) => (f.id === filterId ? { ...f, isActive: !f.isActive } : f)));
          }}
        />

        <QuickSearchRow quickSearch={props.quickSearch} search={search} setQuickSearch={props.setQuickSearch} />
      </div>
      {currentJSFilter ? (
        <JavascriptFilterModal
          currentFilter={currentJSFilter}
          onClose={() => setCurrentJSFilter(null)}
          onSave={(filter) => {
            // Check if filter exists in the array by ID
            const existingIndex = filters.findIndex((f) => f.id === filter.id);
            if (existingIndex >= 0) {
              // Update existing filter
              setFilters(filters.map((f) => (f.id === filter.id ? filter : f)));
            } else {
              // Add new filter
              setFilters([...filters, filter]);
            }
            search.searchFunc('manual');
          }}
        />
      ) : null}
    </>
  );
}
