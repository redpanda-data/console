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

import { useNavigate, useRouterState } from '@tanstack/react-router';
import { functionalUpdate } from '@tanstack/react-table';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableFacetedFilter,
  DataTablePagination,
  isRowActivationClick,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link } from 'components/redpanda-ui/components/typography';
import { FadePresence } from 'components/ui/fade-presence';
import { AlertCircle, Search, X } from 'lucide-react';
import type { Pipeline as APIPipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useInvalidatePipelineQueries,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { appGlobal } from 'state/app-global';
import { scheduleOf, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { useResetRpcnWizardStore } from 'state/rpcn-wizard-store';
import { docsLinks } from 'utils/docs-links';
import { isModifiedClick } from 'utils/mouse-events';

import { connectorOption, createColumns, SCHEDULE_FILTER_OPTIONS } from './list-columns';
import { type PipelineRow, soonestRun, tagFilterValue, toPipelineRow, withSchedules } from './list-row';
import {
  columnFiltersFromSearch,
  facetSearchFromFilters,
  nextPipelineListSearch,
  type PipelineListSearch,
  readPipelineListSearch,
  sortingFromSearch,
  sortSearchFromSorting,
} from './list-search';
import { PipelineListSkeleton } from './list-skeleton';
import {
  countPipelinesPerTab,
  PIPELINE_STATE_TABS,
  type PipelineStateTabId,
  pipelineListEmptyText,
} from './list-utils';
import { PIPELINE_END_RUNS } from './pipeline-end-chip';
import { areSchedulesEnabled, PipelineScheduleDialog } from './pipeline-schedule';
import { TabKafkaConnect } from '../../connect/overview';

const PAGE_SIZE = 20;

// A browser timer that waits longer than about 24 days fires at once, so the schedule clock rechecks hourly.
const MAX_SCHEDULE_CLOCK_WAIT_MS = 60 * 60 * 1000;

// Module scope: the query hook memoizes on request identity. Asked for unconditionally because the
// flag gates making drafts, not seeing the ones already made — turning it back off must not strand a
// draft that still counts against the cluster's quota with no row to delete it from.
const LIST_WITH_DRAFTS = { filter: { includeDrafts: true } } as const;

// One table for every tab, so the tabs need an explicit `aria-controls` target — otherwise a screen
// reader announces "tab, 1 of 4" with nowhere to move into.
const STATUS_PANEL_ID = 'pipeline-status-panel';

const statusTabId = (tabId: PipelineStateTabId) => `pipeline-status-tab-${tabId}`;

// The status lines below the table unmount as they animate, and a live region only announces changes
// made while already mounted — so these stay mounted for the reader.
const ListStatusAnnouncements = ({
  isLoadingMorePages,
  listErrorMessage,
}: {
  isLoadingMorePages: boolean;
  listErrorMessage: string | null;
}) => (
  <>
    <div aria-live="polite" className="sr-only">
      {isLoadingMorePages ? 'Loading more pipelines' : ''}
    </div>
    <div className="sr-only" role="alert">
      {listErrorMessage ?? ''}
    </div>
  </>
);

// Pages still unfetched means partial data; otherwise a background refresh failed and it's stale.
const listErrorMessageFor = (error: { message: string } | null, hasNextPage: boolean | undefined): string | null => {
  if (!error) {
    return null;
  }
  return hasNextPage
    ? `Failed to load all pipelines: ${error.message}`
    : `Couldn't refresh pipelines: ${error.message}`;
};

// With the schedule preview on, each row carries its schedule.
const useScheduledRows = (baseRows: PipelineRow[]): PipelineRow[] => {
  const schedulesEnabled = areSchedulesEnabled();
  const schedules = useSchedulePreviewStore((s) => s.schedules);
  const [scheduleClock, setScheduleClock] = useState(() => Date.now());
  const pipelines = useMemo(
    () => (schedulesEnabled ? withSchedules(baseRows, (id) => scheduleOf(schedules, id), scheduleClock) : baseRows),
    [baseRows, schedulesEnabled, schedules, scheduleClock]
  );
  // Re-join once the soonest run is due, so its next run and the Schedule order move on.
  const soonest = useMemo(() => soonestRun(pipelines), [pipelines]);
  useEffect(() => {
    if (soonest === undefined) {
      return;
    }
    const wait = Math.min(Math.max(soonest - scheduleClock, 0) + 1000, MAX_SCHEDULE_CLOCK_WAIT_MS);
    const timer = setTimeout(() => setScheduleClock(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [soonest, scheduleClock]);
  return pipelines;
};

const usePipelineListData = () => {
  const {
    data: pipelinesData,
    isLoading,
    error,
    hasNextPage,
  } = useListPipelinesQuery(LIST_WITH_DRAFTS, {
    enableSmartPolling: true,
  });
  const invalidatePipelineQueries = useInvalidatePipelineQueries();
  useEffect(() => {
    appGlobal.onRefresh = () => {
      invalidatePipelineQueries();
    };
  }, [invalidatePipelineQueries]);

  const baseRows = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(toPipelineRow),
    [pipelinesData]
  );
  const pipelines = useScheduledRows(baseRows);
  const draftCount = useMemo(() => pipelines.filter((p) => p.isDraft).length, [pipelines]);

  return {
    pipelines,
    draftCount,
    isLoading,
    error,
    // isLoading stays true until every page is drained, so render page one and stream the rest in behind
    // it. A mid-drain error halts the drain for good, so it replaces the spinner.
    isInitialLoading: isLoading && pipelines.length === 0 && !error,
    isLoadingMorePages: isLoading && pipelines.length > 0 && !error,
    listErrorMessage: listErrorMessageFor(error, hasNextPage),
    // A deployed row carries no config, so the schedule dialog reads it from the response.
    configYamlOf: (id: string) => pipelinesData?.pipelines.find((p) => p?.id === id)?.configYaml ?? '',
  };
};

const usePipelineListColumns = (onEditSchedule?: (pipelineId: string) => void) => {
  const navigate = useNavigate();
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();

  return useMemo(
    () =>
      createColumns({
        navigate,
        deleteMutation,
        startMutation,
        stopMutation,
        isDeletingPipeline,
        onEditSchedule,
      }),
    [navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline, onEditSchedule]
  );
};

type SearchPatch = Partial<Record<keyof PipelineListSearch, unknown>>;

const reportSearchUpdateFailure = (error: unknown) => {
  toast.error('Failed to update the pipelines view', { description: String(error) });
};

// The list's view lives in the URL. Every change replaces the entry rather than pushing one, and any
// change but a page move goes back to page 1.
const usePipelineListSearch = () => {
  const navigate = useNavigate();
  const rawSearch = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const search = useMemo(() => readPipelineListSearch(rawSearch), [rawSearch]);
  const update = useCallback(
    (patch: SearchPatch, { keepPage = false }: { keepPage?: boolean } = {}) => {
      const next = nextPipelineListSearch(rawSearch, keepPage ? patch : { ...patch, page: undefined });
      if (JSON.stringify(next) !== JSON.stringify(nextPipelineListSearch(rawSearch, {}))) {
        navigate({ to: '.', search: next, replace: true }).catch(reportSearchUpdateFailure);
      }
    },
    [navigate, rawSearch]
  );
  return { search, update };
};

type PipelineListSearchState = ReturnType<typeof usePipelineListSearch>;

const usePipelinesTable = (
  pipelines: PipelineRow[],
  isLoading: boolean,
  onEditSchedule?: (pipelineId: string) => void
) => {
  const listSearch = usePipelineListSearch();
  const { search, update } = listSearch;
  const columns = usePipelineListColumns(onEditSchedule);
  const sorting = useMemo(() => sortingFromSearch(search), [search]);
  const columnFilters = useMemo(() => columnFiltersFromSearch(search), [search]);
  const pagination = useMemo(() => ({ pageIndex: (search.page ?? 1) - 1, pageSize: PAGE_SIZE }), [search.page]);

  const table = useDataTable({
    data: pipelines,
    columns,
    // Id rather than row index: a row keeps its identity while pages stream in and the sort re-runs,
    // so React reuses its DOM.
    getRowId: (row) => row.id,
    // No column-visibility UI here; also drops Hide from the column header menus.
    enableHiding: false,
    // Also drops the pagination footer's "X of N row(s) selected." text.
    enableRowSelection: false,
    // The URL holds the view; a sort or filter change goes back to page 1 as it's written.
    state: { sorting, columnFilters, pagination },
    onSortingChange: (updater) => update(sortSearchFromSorting(functionalUpdate(updater, sorting))),
    onColumnFiltersChange: (updater) => update(facetSearchFromFilters(functionalUpdate(updater, columnFilters))),
    onPaginationChange: (updater) =>
      update({ page: functionalUpdate(updater, pagination).pageIndex + 1 }, { keepPage: true }),
    // Pages stream in behind the first; the page only resets when the view changes.
    autoResetPageIndex: false,
  });

  // A page past the end (a stale link, or rows that went away) moves to the last one, once every
  // page has loaded: while they stream in, a linked page may not exist yet.
  const pageCount = table.getPageCount();
  useLayoutEffect(() => {
    if (!isLoading && pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) {
      update({ page: Math.max(pageCount, 1) }, { keepPage: true });
    }
  }, [isLoading, pageCount, pagination.pageIndex, update]);

  return { table, columns, listSearch };
};

type PipelinesTable = ReturnType<typeof usePipelinesTable>['table'];

const usePipelineStateTabs = (
  table: PipelinesTable,
  { search, update }: PipelineListSearchState,
  { isLoading, draftCount }: { isLoading: boolean; draftCount: number }
) => {
  const activeTab: PipelineStateTabId = search.tab ?? 'all';

  // Each tab counts what selecting it would yield: the faceted model applies every filter but its own.
  const stateFacetedRows = table.getColumn('state')?.getFacetedRowModel().flatRows;
  const tabCounts = useMemo(
    () => countPipelinesPerTab((stateFacetedRows ?? []).map((r) => r.original.state)),
    [stateFacetedRows]
  );

  const handleTabChange = useCallback(
    (tabId: PipelineStateTabId) => {
      if (tabId !== activeTab) {
        update({ tab: tabId });
      }
    },
    [activeTab, update]
  );

  const visibleTabs = useMemo(
    () => PIPELINE_STATE_TABS.filter((tab) => tab.id !== 'draft' || draftCount > 0),
    [draftCount]
  );

  // Deleting or starting the last draft hides its tab; not while the drain is still filling it.
  useEffect(() => {
    if (!isLoading && activeTab === 'draft' && draftCount === 0) {
      handleTabChange('all');
    }
  }, [isLoading, activeTab, draftCount, handleTabChange]);

  return { activeTab, handleTabChange, tabCounts, visibleTabs };
};

type PipelineStateTabsState = ReturnType<typeof usePipelineStateTabs>;

const usePipelineNameSearch = (table: PipelinesTable, { search, update }: PipelineListSearchState) => {
  // The search box types ahead of the URL, which takes it after a pause.
  const [searchText, setSearchText] = useState(search.q ?? '');
  const writtenQuery = useRef(search.q ?? '');
  useEffect(() => {
    // Follows the URL when it changes some other way (back, a link, Clear filters).
    const urlQuery = search.q ?? '';
    if (urlQuery !== writtenQuery.current) {
      writtenQuery.current = urlQuery;
      setSearchText(urlQuery);
    }
  }, [search.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim() ? searchText : '';
      if (next !== writtenQuery.current) {
        writtenQuery.current = next;
        update({ q: next });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchText, update]);

  const clearFilters = useCallback(() => {
    setSearchText('');
    writtenQuery.current = '';
    update({ q: undefined, ...facetSearchFromFilters([]) });
  }, [update]);

  return {
    search: searchText,
    setSearch: setSearchText,
    // Status tabs are views, not filters. Read the search box, not the URL: that lands 200ms later, and
    // Clear filters must be clickable as soon as the user has typed.
    hasActiveFilters:
      searchText.trim() !== '' || table.state.columnFilters.some((f) => f.id !== 'state' && f.id !== 'name'),
    clearFilters,
  };
};

type PipelineNameSearchState = ReturnType<typeof usePipelineNameSearch>;

const CreatePipelineButton = () => {
  const navigate = useNavigate();
  const resetRpcnWizardStore = useResetRpcnWizardStore();

  const handleCreateClick = useCallback(() => {
    resetRpcnWizardStore();
    navigate({ to: '/rp-connect/create', search: { serverless: undefined } }).catch((error: unknown) => {
      toast.error('Failed to open the pipeline editor', { description: String(error) });
    });
  }, [resetRpcnWizardStore, navigate]);

  return <Button onClick={handleCreateClick}>Create a pipeline</Button>;
};

const PipelineStateTabsBar = ({ tabs }: { tabs: PipelineStateTabsState }) => (
  <Tabs onValueChange={(value) => tabs.handleTabChange(value as PipelineStateTabId)} value={tabs.activeTab}>
    <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
      {tabs.visibleTabs.map((tab) => (
        <TabsTrigger
          aria-controls={STATUS_PANEL_ID}
          id={statusTabId(tab.id)}
          key={tab.id}
          value={tab.id}
          variant="underline"
        >
          {tab.label}
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-body-sm text-muted-foreground tabular-nums">
            {tabs.tabCounts[tab.id]}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const PipelineListToolbar = ({
  pipelines,
  table,
  nameSearch,
}: {
  pipelines: PipelineRow[];
  table: PipelinesTable;
  nameSearch: PipelineNameSearchState;
}) => {
  const inputOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.inputs))].map(connectorOption),
    [pipelines]
  );
  const outputOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.outputs))].map(connectorOption),
    [pipelines]
  );
  const tagOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.tags.map(tagFilterValue)))].map((v) => ({ value: v, label: v })),
    [pipelines]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Search pipelines by name or ID"
        className="w-64"
        onChange={(e) => nameSearch.setSearch(e.target.value)}
        placeholder="Search by name or ID..."
        value={nameSearch.search}
      >
        <InputStart>
          <TonedIcon className="h-4 w-4" icon={Search} tone="muted" />
        </InputStart>
      </Input>
      <DataTableFacetedFilter column={table.getColumn('inputs')} options={inputOptions} title="Input" />
      <DataTableFacetedFilter column={table.getColumn('outputs')} options={outputOptions} title="Output" />
      <DataTableFacetedFilter column={table.getColumn('tags')} options={tagOptions} title="Tags" />
      <DataTableFacetedFilter column={table.getColumn('end')} options={PIPELINE_END_RUNS} title="Runs" />
      {areSchedulesEnabled() ? (
        <DataTableFacetedFilter
          column={table.getColumn('schedule')}
          options={SCHEDULE_FILTER_OPTIONS}
          title="Schedule"
        />
      ) : null}
      <FadePresence show={nameSearch.hasActiveFilters}>
        <Button onClick={nameSearch.clearFilters} size="sm" variant="ghost">
          <X /> Clear filters
        </Button>
      </FadePresence>
    </div>
  );
};

// ⌘/middle-click mean "open elsewhere" — leave them to the name cell's link. The registry guard, same one
// DataTable's rows use, drops clicks on a control in the row, and portaled children (open menus, the
// delete-confirm backdrop) that bubble outside the <tr>. A mouseup that ends a text selection (copying the
// id) isn't navigation intent.
const isRowNavigationClick = (event: MouseEvent<HTMLTableRowElement>): boolean =>
  !isModifiedClick(event) &&
  isRowActivationClick(event.target, event.currentTarget) &&
  !window.getSelection()?.toString();

const PipelineListTable = ({
  table,
  columnCount,
  emptyContent,
}: {
  table: PipelinesTable;
  columnCount: number;
  emptyContent: ReactNode;
}) => {
  const navigate = useNavigate();
  const { rows } = table.getRowModel();

  const handleRowClick = useCallback(
    (pipelineId: string, event: MouseEvent<HTMLTableRowElement>) => {
      if (isRowNavigationClick(event)) {
        navigate({ to: '/rp-connect/$pipelineId', params: { pipelineId: encodeURIComponent(pipelineId) } }).catch(
          (error: unknown) => {
            toast.error('Failed to open the pipeline', { description: String(error) });
          }
        );
      }
    },
    [navigate]
  );

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center" colSpan={columnCount}>
              {emptyContent}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            // Pointer shortcut only: the name cell holds the same link, so a row tab stop would
            // duplicate it on every row.
            <TableRow
              className="cursor-pointer"
              key={row.id}
              onClick={(event) => handleRowClick(row.original.id, event)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{<table.FlexRender cell={cell} />}</TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

// One schedule dialog for the whole list, opened from a row's menu.
const ListScheduleDialog = ({
  pipelineId,
  configYaml,
  onClose,
}: {
  pipelineId: string;
  configYaml: string;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const editPipeline = () => {
    navigate({ to: '/rp-connect/$pipelineId/edit', params: { pipelineId: encodeURIComponent(pipelineId) } }).catch(
      (error: unknown) => {
        toast.error('Failed to open the pipeline editor', { description: String(error) });
      }
    );
  };
  return (
    <PipelineScheduleDialog
      configYaml={configYaml}
      fixHint={
        <Button className="self-start" onClick={editPipeline} size="sm" variant="outline">
          Edit pipeline
        </Button>
      }
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      pipelineId={pipelineId}
    />
  );
};

const PipelineListPageContent = () => {
  const list = usePipelineListData();
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null);
  const { table, columns, listSearch } = usePipelinesTable(
    list.pipelines,
    list.isLoading,
    areSchedulesEnabled() ? setScheduleTarget : undefined
  );
  const tabs = usePipelineStateTabs(table, listSearch, list);
  const nameSearch = usePipelineNameSearch(table, listSearch);

  if (list.isInitialLoading) {
    return <PipelineListSkeleton />;
  }

  if (list.error && list.pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-destructive">
        <AlertCircle className="h-4 w-4" />
        Error loading pipelines: {list.error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <PipelineStateTabsBar tabs={tabs} />
        <CreatePipelineButton />
      </div>
      <PipelineListToolbar nameSearch={nameSearch} pipelines={list.pipelines} table={table} />
      <div aria-labelledby={statusTabId(tabs.activeTab)} id={STATUS_PANEL_ID} role="tabpanel">
        <PipelineListTable
          columnCount={columns.length}
          emptyContent={
            list.isLoadingMorePages ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Spinner /> Loading pipelines...
              </div>
            ) : (
              pipelineListEmptyText({
                hasActiveFilters: nameSearch.hasActiveFilters,
                activeTab: tabs.activeTab,
                totalPipelines: list.pipelines.length,
              })
            )
          }
          table={table}
        />
      </div>
      <FadePresence show={list.isLoadingMorePages && table.getRowModel().rows.length > 0}>
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <Spinner /> Loading more pipelines...
        </div>
      </FadePresence>
      <FadePresence show={Boolean(list.listErrorMessage) && list.pipelines.length > 0}>
        <div className="flex items-center gap-2 text-body text-destructive">
          <AlertCircle className="h-4 w-4" />
          {list.listErrorMessage}
        </div>
      </FadePresence>
      <ListStatusAnnouncements isLoadingMorePages={list.isLoadingMorePages} listErrorMessage={list.listErrorMessage} />
      <DataTablePagination table={table} />
      {scheduleTarget ? (
        <ListScheduleDialog
          configYaml={list.configYamlOf(scheduleTarget)}
          onClose={() => setScheduleTarget(null)}
          pipelineId={scheduleTarget}
        />
      ) : null}
    </div>
  );
};

const RedpandaConnectContent = () => (
  <div className="flex flex-col gap-4">
    <div className="text-body">
      Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that drive
      real-time analytics and actionable business insights. Integrate data across systems with hundreds of prebuilt
      connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.{' '}
      <Link href={docsLinks.cloud.connectAbout} rel="noopener noreferrer" target="_blank">
        Learn more
      </Link>
    </div>
    <PipelineListPageContent />
  </div>
);

export const PipelineListPage = () => {
  const { data: kafkaConnectors, isLoading: isLoadingKafkaConnect } = useKafkaConnectConnectorsQuery();

  const isKafkaConnectEnabled = kafkaConnectors?.isConfigured === true;
  const showKafkaConnectLoadingHint = isLoadingKafkaConnect && !kafkaConnectors;

  if (!isKafkaConnectEnabled) {
    return (
      <div className="flex flex-col gap-4">
        {showKafkaConnectLoadingHint ? (
          <div className="flex items-center gap-2 text-body text-muted-foreground">
            <Spinner />
            <div className="text-body text-muted-foreground">Checking for Kafka Connect availability...</div>
          </div>
        ) : null}
        <RedpandaConnectContent />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-body">
        There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and Kafka
        Connect.
      </div>
      <Tabs defaultValue="redpanda-connect">
        <TabsList variant="underline">
          <TabsTrigger value="redpanda-connect" variant="underline">
            Redpanda Connect
          </TabsTrigger>
          <TabsTrigger value="kafka-connect" variant="underline">
            Kafka Connect
          </TabsTrigger>
        </TabsList>
        <TabsContents>
          <div className="p-6">
            {/* keepMounted: panels unmount by default, dropping search/facets/page on a trip to the
                Kafka Connect tab and back. */}
            <TabsContent keepMounted value="redpanda-connect">
              <RedpandaConnectContent />
            </TabsContent>
            <TabsContent value="kafka-connect">
              <div className="flex flex-col gap-6">
                <div className="text-body">
                  Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data
                  with different data systems.{' '}
                  <Link href={docsLinks.cloud.managedConnectors} rel="noopener noreferrer" target="_blank">
                    Learn more
                  </Link>
                </div>
                <TabKafkaConnect />
              </div>
            </TabsContent>
          </div>
        </TabsContents>
      </Tabs>
    </div>
  );
};
