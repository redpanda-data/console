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

import { useNavigate } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
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
import { type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useInvalidatePipelineQueries,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { appGlobal } from 'state/app-global';
import { useResetRpcnWizardStore } from 'state/rpcn-wizard-store';
import { docsLinks } from 'utils/docs-links';
import { isModifiedClick } from 'utils/mouse-events';

import { connectorOption, createColumns } from './list-columns';
import { tagFilterValue, toPipelineRow } from './list-row';
import { PipelineListSkeleton } from './list-skeleton';
import {
  countPipelinesPerTab,
  PIPELINE_STATE_TABS,
  type PipelineStateTabId,
  pipelineListEmptyText,
  stateFilterValues,
} from './list-utils';
import { PIPELINE_END_RUNS } from './pipeline-end-chip';
import { TabKafkaConnect } from '../../connect/overview';

const PAGE_SIZE = 20;

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

const PipelineListPageContent = () => {
  const navigate = useNavigate();
  const resetRpcnWizardStore = useResetRpcnWizardStore();
  // Sort by status so error and transitioning pipelines land on page 1 of a large cluster.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'state', desc: false }]);

  const {
    data: pipelinesData,
    isLoading,
    error,
    hasNextPage,
  } = useListPipelinesQuery(LIST_WITH_DRAFTS, {
    enableSmartPolling: true,
  });
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();
  const invalidatePipelineQueries = useInvalidatePipelineQueries();
  useEffect(() => {
    appGlobal.onRefresh = () => {
      invalidatePipelineQueries();
    };
  }, [invalidatePipelineQueries]);

  const pipelines = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(toPipelineRow),
    [pipelinesData]
  );
  const draftCount = useMemo(() => pipelines.filter((p) => p.isDraft).length, [pipelines]);

  const columns = useMemo(
    () =>
      createColumns({
        navigate,
        deleteMutation,
        startMutation,
        stopMutation,
        isDeletingPipeline,
      }),
    [navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline]
  );

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
    onSortingChange: setSorting,
    // autoResetPageIndex would yank the user to page 1 on every drained page; the layout effects below
    // reset on filter/sort changes instead.
    autoResetPageIndex: false,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: PAGE_SIZE,
      },
    },
  });

  const pageCount = table.getPageCount();
  useLayoutEffect(() => {
    const pageIndex = table.state.pagination.pageIndex;
    if (pageIndex > 0 && pageIndex >= pageCount) {
      table.setPageIndex(Math.max(pageCount - 1, 0));
    }
  }, [pageCount, table]);

  const { columnFilters } = table.state;
  // biome-ignore lint/correctness/useExhaustiveDependencies: columnFilters and sorting are the change-triggers — editing either jumps back to page 1. `table` is a new object every render, so depending on it would undo every page move.
  useLayoutEffect(() => {
    if (table.state.pagination.pageIndex !== 0) {
      table.setPageIndex(0);
    }
  }, [columnFilters, sorting]);

  const [activeTab, setActiveTab] = useState<PipelineStateTabId>('all');
  const [search, setSearch] = useState('');

  // Each tab counts what selecting it would yield: the faceted model applies every filter but its own.
  const stateFacetedRows = table.getColumn('state')?.getFacetedRowModel().flatRows;
  const tabCounts = useMemo(
    () => countPipelinesPerTab((stateFacetedRows ?? []).map((r) => r.original.state)),
    [stateFacetedRows]
  );

  const handleTabChange = useCallback(
    (tabId: PipelineStateTabId) => {
      if (tabId === activeTab) {
        return;
      }
      setActiveTab(tabId);
      const tab = PIPELINE_STATE_TABS.find((t) => t.id === tabId);
      table.getColumn('state')?.setFilterValue(tab ? stateFilterValues(tab) : undefined);
    },
    [table, activeTab]
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const column = table.getColumn('name');
      const next = search.trim() ? search : undefined;
      // setFilterValue(undefined) on an unfiltered column still makes a new columnFilters array, which
      // trips the page-reset effect — so skip no-op writes, including the post-mount tick.
      if (column && column.getFilterValue() !== next) {
        column.setFilterValue(next);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, table]);

  // Status tabs are views, not filters. Read `search` directly, not its column filter: that lands
  // 200ms later, and Clear filters must be clickable as soon as the user has typed.
  const hasActiveFilters = search.trim() !== '' || columnFilters.some((f) => f.id !== 'state');
  const clearFilters = useCallback(() => {
    setSearch('');
    for (const columnId of ['name', 'inputs', 'outputs', 'tags', 'end']) {
      table.getColumn(columnId)?.setFilterValue(undefined);
    }
  }, [table]);

  const handleRowClick = useCallback(
    (pipelineId: string, event: MouseEvent<HTMLTableRowElement>) => {
      // ⌘/middle-click mean "open elsewhere" — leave them to the name cell's link.
      if (isModifiedClick(event)) {
        return;
      }
      // Registry guard, same one DataTable's rows use: drops clicks on a control in the row, and
      // portaled children (open menus, the delete-confirm backdrop) that bubble outside the <tr>.
      if (!isRowActivationClick(event.target, event.currentTarget)) {
        return;
      }
      // A mouseup that ends a text selection (copying the id) isn't navigation intent.
      if (window.getSelection()?.toString()) {
        return;
      }
      navigate({ to: '/rp-connect/$pipelineId', params: { pipelineId: encodeURIComponent(pipelineId) } });
    },
    [navigate]
  );

  const handleCreateClick = useCallback(() => {
    resetRpcnWizardStore();
    navigate({ to: '/rp-connect/create', search: { serverless: undefined } });
  }, [resetRpcnWizardStore, navigate]);

  // isLoading stays true until every page is drained, so render page one and stream the rest in behind
  // it. A mid-drain error halts the drain for good, so it replaces the spinner.
  const isInitialLoading = isLoading && pipelines.length === 0 && !error;
  const isLoadingMorePages = isLoading && pipelines.length > 0 && !error;

  if (isInitialLoading) {
    return <PipelineListSkeleton />;
  }

  if (error && pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-destructive">
        <AlertCircle className="h-4 w-4" />
        Error loading pipelines: {error.message}
      </div>
    );
  }

  const rows = table.getRowModel().rows;

  // Pages still unfetched means partial data; otherwise a background refresh failed and it's stale.
  let listErrorMessage: string | null = null;
  if (error) {
    listErrorMessage = hasNextPage
      ? `Failed to load all pipelines: ${error.message}`
      : `Couldn't refresh pipelines: ${error.message}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Tabs onValueChange={(value) => handleTabChange(value as PipelineStateTabId)} value={activeTab}>
          <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                aria-controls={STATUS_PANEL_ID}
                id={statusTabId(tab.id)}
                key={tab.id}
                value={tab.id}
                variant="underline"
              >
                {tab.label}
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-body-sm text-muted-foreground tabular-nums">
                  {tabCounts[tab.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button onClick={handleCreateClick}>Create a pipeline</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search pipelines by name or ID"
          className="w-64"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID..."
          value={search}
        >
          <InputStart>
            <Search className="h-4 w-4 text-muted-foreground" />
          </InputStart>
        </Input>
        <DataTableFacetedFilter column={table.getColumn('inputs')} options={inputOptions} title="Input" />
        <DataTableFacetedFilter column={table.getColumn('outputs')} options={outputOptions} title="Output" />
        <DataTableFacetedFilter column={table.getColumn('tags')} options={tagOptions} title="Tags" />
        <DataTableFacetedFilter column={table.getColumn('end')} options={PIPELINE_END_RUNS} title="Runs" />
        <FadePresence show={hasActiveFilters}>
          <Button onClick={clearFilters} size="sm" variant="ghost">
            <X /> Clear filters
          </Button>
        </FadePresence>
      </div>
      <div aria-labelledby={statusTabId(activeTab)} id={STATUS_PANEL_ID} role="tabpanel">
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
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  {isLoadingMorePages ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Spinner /> Loading pipelines...
                    </div>
                  ) : (
                    pipelineListEmptyText({ hasActiveFilters, activeTab, totalPipelines: pipelines.length })
                  )}
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
                    <TableCell className="py-3" key={cell.id}>
                      {<table.FlexRender cell={cell} />}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <FadePresence
        className="flex items-center gap-2 text-body text-muted-foreground"
        show={isLoadingMorePages && rows.length > 0}
      >
        <Spinner /> Loading more pipelines...
      </FadePresence>
      <FadePresence
        className="flex items-center gap-2 text-body text-destructive"
        show={Boolean(listErrorMessage) && pipelines.length > 0}
      >
        <AlertCircle className="h-4 w-4" />
        {listErrorMessage}
      </FadePresence>
      <ListStatusAnnouncements isLoadingMorePages={isLoadingMorePages} listErrorMessage={listErrorMessage} />
      <DataTablePagination table={table} />
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
        <TabsContents className="p-6">
          {/* keepMounted: panels unmount by default, dropping search/facets/page on a trip to the
              Kafka Connect tab and back. */}
          <TabsContent keepMounted value="redpanda-connect">
            <RedpandaConnectContent />
          </TabsContent>
          <TabsContent value="kafka-connect">
            <div className="flex flex-col gap-6">
              <div className="text-body">
                Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data with
                different data systems.{' '}
                <Link href={docsLinks.cloud.managedConnectors} rel="noopener noreferrer" target="_blank">
                  Learn more
                </Link>
              </div>
              <TabKafkaConnect />
            </div>
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
  );
};
