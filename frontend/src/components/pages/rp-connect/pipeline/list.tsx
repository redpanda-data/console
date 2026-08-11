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

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { Link as TanStackRouterLink, useNavigate } from '@tanstack/react-router';
import type { ColumnDef, FilterFn, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ComponentName } from 'assets/connectors/component-logo-map';
import { getUserTagEntries } from 'components/constants';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  isRowActivationClick,
} from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, List, ListItem } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
import { FadePresence } from 'components/ui/fade-presence';
import { PIPELINE_STATE_LABELS, STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { AlertCircle, Box, MoreHorizontal, Search, X } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  type MouseEvent,
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { useResetRpcnWizardStore } from 'state/rpcn-wizard-store';
import { docsLinks } from 'utils/docs-links';
import { isModifiedClick } from 'utils/mouse-events';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { parseConfigComponentsCached } from './config-components-cache';
import {
  aggregateConnectors,
  countPipelinesPerTab,
  matchesNameOrId,
  PIPELINE_STATE_TABS,
  type PipelineStateTabId,
  pipelineListEmptyText,
} from './list-utils';
import { TabKafkaConnect } from '../../connect/overview';
import { ConnectorLogo } from '../onboarding/connector-logo';

type TagPair = { key: string; value: string };

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  inputs: string[];
  outputs: string[];
  tags: TagPair[];
};

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => {
  const { inputs, outputs } = parseConfigComponentsCached(apiPipeline.configYaml);
  const tags = getUserTagEntries(apiPipeline.tags);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    inputs,
    outputs,
    tags,
  };
};

const EmptyCell = () => <span className="text-muted-foreground">—</span>;

// One string per tag pair, so `arrIncludesSome` and the facet counts agree on the value.
const tagFilterValue = (tag: TagPair) => `${tag.key}:${tag.value}`;

const ConnectorBadges = ({ names }: { names: string[] }) => {
  const connectors = useMemo(() => aggregateConnectors(names), [names]);
  if (connectors.length === 0) {
    return <EmptyCell />;
  }
  return (
    <BadgeGroup
      maxVisible={2}
      renderOverflowContent={(overflow) => (
        <List>
          {connectors.slice(-overflow.length).map((c) => (
            <ListItem key={c.name}>{c.count > 1 ? `${c.name} ×${c.count}` : c.name}</ListItem>
          ))}
        </List>
      )}
    >
      {connectors.map((c) => (
        <Badge key={c.name} variant="neutral-inverted">
          <ConnectorLogo className="size-3.5" fallback={Box} name={c.name as ComponentName} />
          {/* One text node: as siblings, name and multiplier sit a pixel off each other's baseline. */}
          <span>
            {c.name}
            {c.count > 1 ? <span className="ml-1 text-muted-foreground">×{c.count}</span> : null}
          </span>
        </Badge>
      ))}
    </BadgeGroup>
  );
};

const pipelineStateToStatusVariant: Record<Pipeline_State, StatusBadgeVariant> = {
  [Pipeline_State.COMPLETED]: 'success',
  [Pipeline_State.STARTING]: 'starting',
  [Pipeline_State.STOPPING]: 'stopping',
  [Pipeline_State.STOPPED]: 'disabled',
  [Pipeline_State.ERROR]: 'error',
  [Pipeline_State.RUNNING]: 'success',
  [Pipeline_State.UNSPECIFIED]: 'disabled',
};

// autoRemove as the built-in array filters do: an empty selection means "no filter", not "match nothing".
const stateInFilterFn: FilterFn<Pipeline> = (row, columnId, filterValue: string[]) =>
  filterValue.includes(row.getValue<string>(columnId));
stateInFilterFn.autoRemove = (value) => !value || (Array.isArray(value) && value.length === 0);

// Problems and transitions first, idle last.
const pipelineStateSortPriority: Record<Pipeline_State, number> = {
  [Pipeline_State.ERROR]: 0,
  [Pipeline_State.STARTING]: 1,
  [Pipeline_State.STOPPING]: 2,
  [Pipeline_State.RUNNING]: 3,
  [Pipeline_State.COMPLETED]: 4,
  [Pipeline_State.STOPPED]: 5,
  [Pipeline_State.UNSPECIFIED]: 6,
};

const PAGE_SIZE = 20;

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

const SKELETON_COLUMNS: { head: string; cell: ReactElement }[] = [
  {
    head: 'w-24',
    cell: (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  {
    head: 'w-20',
    cell: (
      <div className="flex gap-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  { head: 'w-16', cell: <Skeleton className="h-6 w-16" /> },
  { head: 'w-8', cell: <Skeleton className="h-8 w-8" /> },
];

const SKELETON_ROW_COUNT = 5;

const PipelineListSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-20" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          {SKELETON_COLUMNS.map((column, columnIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
            <TableHead key={columnIndex}>
              <Skeleton className={cn('h-4', column.head)} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
          <TableRow key={rowIndex}>
            {SKELETON_COLUMNS.map((column, columnIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
              <TableCell key={columnIndex}>{column.cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {/* Stands in for the pagination footer: without it, the first real paint lifts the table. */}
    <div className="flex items-center justify-end gap-6 px-2">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  </div>
);

type ActionsCellProps = {
  pipeline: Pipeline;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
};

const ActionsCell = memo(
  ({ pipeline, navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline }: ActionsCellProps) => {
    const canStart = (STARTABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const canStop = (STOPPABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const isStarting = pipeline.state === Pipeline_State.STARTING;
    const isStopping = pipeline.state === Pipeline_State.STOPPING;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const handleStart = () => {
      const startRequest = create(StartPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      startMutation(startRequest, {
        onSuccess: () => {
          toast.success('Pipeline started');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'start',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleStop = () => {
      const stopRequest = create(StopPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      stopMutation(stopRequest, {
        onSuccess: () => {
          toast.success('Pipeline stopped');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'stop',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleDelete = (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id },
      });

      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'delete',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    return (
      <div className="flex min-w-[68px] justify-end" data-actions-column>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="size-8" size="icon" variant="secondary-ghost">
                <MoreHorizontal />
                <span className="sr-only">Open menu</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: '/rp-connect/$pipelineId/edit',
                  params: { pipelineId: encodeURIComponent(pipeline.id) },
                })
              }
            >
              Edit
            </DropdownMenuItem>
            {isStarting ? <DropdownMenuItem onClick={handleStart}>Retry start</DropdownMenuItem> : null}
            {isStopping ? <DropdownMenuItem onClick={handleStop}>Retry stop</DropdownMenuItem> : null}
            {canStart ? <DropdownMenuItem onClick={handleStart}>Start</DropdownMenuItem> : null}
            {canStop ? <DropdownMenuItem onClick={handleStop}>Stop</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DeleteResourceMenuItem isDeleting={isDeletingPipeline} onSelect={() => setIsDeleteDialogOpen(true)} />
          </DropdownMenuContent>
        </DropdownMenu>
        <DeleteResourceAlertDialog
          isDeleting={isDeletingPipeline}
          onDelete={handleDelete}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
          resourceId={pipeline.id}
          resourceName={pipeline.name}
          resourceType="Pipeline"
        />
      </div>
    );
  }
);

ActionsCell.displayName = 'ActionsCell';

type CreateColumnsOptions = {
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
};

// Facet options are rebuilt on every drain page and poll tick, and a fresh component type per render
// remounts every logo in the open popover.
const connectorIcons = new Map<string, (props: { className?: string }) => ReactElement>();

const connectorIcon = (name: string) => {
  const cached = connectorIcons.get(name);
  if (cached) {
    return cached;
  }
  const Icon = (props: { className?: string }) => (
    <ConnectorLogo fallback={Box} name={name as ComponentName} {...props} />
  );
  connectorIcons.set(name, Icon);
  return Icon;
};

const connectorOption = (name: string) => ({
  value: name,
  label: name,
  icon: connectorIcon(name),
});

const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
}: CreateColumnsOptions): ColumnDef<Pipeline>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pipeline" />,
    filterFn: (row, _columnId, filterValue: string) => matchesNameOrId(filterValue, row.original.name, row.original.id),
    cell: ({ row }) => {
      const id = row.original.id;
      const name = row.getValue('name') as string;
      return (
        <div className="flex max-w-[300px] flex-col gap-0.5 overflow-hidden">
          {/* Rows navigate on click, so the link underlines on hover only. */}
          <Link
            as={TanStackRouterLink}
            className="block truncate text-base text-primary no-underline hover:underline"
            params={{ pipelineId: encodeURIComponent(id) }}
            title={name}
            to="/rp-connect/$pipelineId"
          >
            {name}
          </Link>
          {id !== name ? (
            // select-all: one click selects the whole id, and the row's guard keeps it from navigating.
            <span className="cursor-text select-all truncate font-mono text-muted-foreground text-xs" title={id}>
              {id}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: 'inputs',
    header: 'Input',
    filterFn: 'arrIncludesSome',
    // Without this, faceting keys on the array itself and the per-option counts never resolve.
    // Deduplicated per row, or two `redpanda` inputs would count 2 against a single row.
    getUniqueValues: (row) => [...new Set(row.inputs)],
    cell: ({ row }) => <ConnectorBadges names={row.getValue('inputs') as string[]} />,
  },
  {
    accessorKey: 'outputs',
    header: 'Output',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => [...new Set(row.outputs)],
    cell: ({ row }) => <ConnectorBadges names={row.getValue('outputs') as string[]} />,
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags.map(tagFilterValue),
    header: 'Tags',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => row.tags.map(tagFilterValue),
    cell: ({ row }) => {
      const tags = row.original.tags;
      if (tags.length === 0) {
        return <EmptyCell />;
      }
      return (
        <BadgeGroup
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {tags.slice(-overflow.length).map((t) => (
                <ListItem key={t.key}>
                  {t.key}: {t.value}
                </ListItem>
              ))}
            </List>
          )}
          variant="simple-outline"
        >
          {tags.map((t) => (
            <Badge key={t.key} variant="simple-outline">
              {t.key}: {t.value}
            </Badge>
          ))}
        </BadgeGroup>
      );
    },
  },
  {
    id: 'state',
    accessorFn: (row) => String(row.state),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    filterFn: stateInFilterFn,
    // Enum values the generated Pipeline_State doesn't know yet sort last, not NaN.
    sortingFn: (rowA, rowB) =>
      (pipelineStateSortPriority[rowA.original.state] ?? Number.MAX_SAFE_INTEGER) -
      (pipelineStateSortPriority[rowB.original.state] ?? Number.MAX_SAFE_INTEGER),
    // Label from the state, not the variant: COMPLETED and RUNNING share `success`, whose default
    // copy is "Running".
    cell: ({ row }) => (
      <StatusBadge size="sm" variant={pipelineStateToStatusVariant[row.original.state]}>
        {PIPELINE_STATE_LABELS[row.original.state] ?? 'Unknown'}
      </StatusBadge>
    ),
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => (
      <ActionsCell
        deleteMutation={deleteMutation}
        isDeletingPipeline={isDeletingPipeline}
        navigate={navigate}
        pipeline={row.original}
        startMutation={startMutation}
        stopMutation={stopMutation}
      />
    ),
  },
];

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
  } = useListPipelinesQuery(undefined, {
    enableSmartPolling: true,
  });
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();

  const pipelines = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(transformAPIPipeline),
    [pipelinesData]
  );

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

  const table = useReactTable({
    data: pipelines,
    columns,
    // Id rather than row index: a row keeps its identity while pages stream in and the sort re-runs,
    // so React reuses its DOM.
    getRowId: (row) => row.id,
    // No column-visibility UI here; also drops Hide from the column header menus.
    enableHiding: false,
    // Also drops the pagination footer's "X of N row(s) selected." text.
    enableRowSelection: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    // autoResetPageIndex would yank the user to page 1 on every drained page; the layout effects below
    // reset on filter/sort changes instead.
    autoResetPageIndex: false,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: PAGE_SIZE,
      },
    },
  });

  const pageCount = table.getPageCount();
  useLayoutEffect(() => {
    const pageIndex = table.getState().pagination.pageIndex;
    if (pageIndex > 0 && pageIndex >= pageCount) {
      table.setPageIndex(Math.max(pageCount - 1, 0));
    }
  }, [pageCount, table]);

  const { columnFilters } = table.getState();
  // biome-ignore lint/correctness/useExhaustiveDependencies: columnFilters and sorting are the change-triggers — editing either jumps back to page 1.
  useLayoutEffect(() => {
    if (table.getState().pagination.pageIndex !== 0) {
      table.setPageIndex(0);
    }
  }, [table, columnFilters, sorting]);

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
      const states = PIPELINE_STATE_TABS.find((t) => t.id === tabId)?.states;
      table.getColumn('state')?.setFilterValue(states ? states.map(String) : undefined);
    },
    [table, activeTab]
  );

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
    for (const columnId of ['name', 'inputs', 'outputs', 'tags']) {
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
      <div className="flex items-center justify-center gap-2 py-8 text-error">
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
            {PIPELINE_STATE_TABS.map((tab) => (
              <TabsTrigger
                aria-controls={STATUS_PANEL_ID}
                id={statusTabId(tab.id)}
                key={tab.id}
                value={tab.id}
                variant="underline"
              >
                {tab.label}
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
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
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <FadePresence
        className="flex items-center gap-2 text-muted-foreground text-sm"
        show={isLoadingMorePages && rows.length > 0}
      >
        <Spinner /> Loading more pipelines...
      </FadePresence>
      <FadePresence
        className="flex items-center gap-2 text-error text-sm"
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
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
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
