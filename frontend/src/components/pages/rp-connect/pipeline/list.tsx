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
} from 'components/redpanda-ui/components/data-table';
import { isInteractiveTarget } from 'components/redpanda-ui/components/data-table/data-table-utils';
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
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
import { FadePresence } from 'components/ui/fade-presence';
import { STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
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
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import {
  aggregateConnectors,
  countPipelinesPerTab,
  matchesNameOrId,
  PIPELINE_STATE_TABS,
  type PipelineStateTabId,
} from './list-utils';
import { TabKafkaConnect } from '../../connect/overview';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { parseConfigComponents } from '../utils/yaml';

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

// parseConfigComponents runs a full YAML parse, and the query cache hands back
// fresh page arrays on every drain step and poll tick, so the list transform
// re-runs over all rows. Memoize per config text to keep that pass O(n).
const configComponentsCache = new Map<string, ReturnType<typeof parseConfigComponents>>();
const CONFIG_COMPONENTS_CACHE_LIMIT = 10_000;

const parseConfigComponentsCached = (configYaml: string): ReturnType<typeof parseConfigComponents> => {
  const cached = configComponentsCache.get(configYaml);
  if (cached) {
    return cached;
  }
  if (configComponentsCache.size >= CONFIG_COMPONENTS_CACHE_LIMIT) {
    // Evict the oldest half (Map preserves insertion order): clearing
    // everything mid-pass would make each refresh of a >10k dataset reparse
    // the entire list — the exact cost this cache exists to avoid.
    let surplus = CONFIG_COMPONENTS_CACHE_LIMIT / 2;
    for (const key of configComponentsCache.keys()) {
      configComponentsCache.delete(key);
      surplus -= 1;
      if (surplus <= 0) {
        break;
      }
    }
  }
  const parsed = parseConfigComponents(configYaml);
  configComponentsCache.set(configYaml, parsed);
  return parsed;
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

// Duplicate connectors collapse into one badge with a multiplier ("redpanda ×2")
// so wide fan-in/fan-out pipelines don't spend the column on repeats.
const ConnectorBadges = ({ names }: { names: string[] }) => {
  const connectors = aggregateConnectors(names);
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
          {/* One text node so name and multiplier share a baseline — as sibling
              flex items they get box-centered a pixel apart. */}
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

// Scalar-in-set matcher for the status tabs. autoRemove mirrors the built-in
// array filters: an empty selection means "no filter", not "match nothing".
const stateInFilterFn: FilterFn<Pipeline> = (row, columnId, filterValue: string[]) =>
  filterValue.includes(row.getValue<string>(columnId));
stateInFilterFn.autoRemove = (value) => !value || (Array.isArray(value) && value.length === 0);

// Attention-first ordering for the Status column: problems and transitions
// surface before healthy pipelines, idle ones sink to the bottom.
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
          <TableHead>
            <Skeleton className="h-4 w-24" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-8" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
          <TableRow key={i}>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-20" />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-8 w-8" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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

// Facet options are rebuilt whenever the row set changes — every drain page and
// every poll tick. Cache the icon component per connector name so its identity
// survives that: a fresh function type would make React remount every logo in
// the open popover, flashing them mid-poll.
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
          {/* Rows navigate on click, so the name link stays quiet until hovered
              — twenty dotted underlines per page read as noise. */}
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
            // select-all: one click selects the whole id for copying; the row's
            // selection guard keeps that click from navigating.
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
    // Without this, faceting keys on the array itself and per-option counts
    // in the filter popover never resolve.
    getUniqueValues: (row) => row.inputs,
    cell: ({ row }) => <ConnectorBadges names={row.getValue('inputs') as string[]} />,
  },
  {
    accessorKey: 'outputs',
    header: 'Output',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => row.outputs,
    cell: ({ row }) => <ConnectorBadges names={row.getValue('outputs') as string[]} />,
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags.map((t) => `${t.key}:${t.value}`),
    header: 'Tags',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => row.tags.map((t) => `${t.key}:${t.value}`),
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
    // The ?? guards against enum values a newer server may send that the
    // generated Pipeline_State doesn't know yet — they sort last, not NaN.
    sortingFn: (rowA, rowB) =>
      (pipelineStateSortPriority[rowA.original.state] ?? Number.MAX_SAFE_INTEGER) -
      (pipelineStateSortPriority[rowB.original.state] ?? Number.MAX_SAFE_INTEGER),
    cell: ({ row }) => <StatusBadge size="sm" variant={pipelineStateToStatusVariant[row.original.state]} />,
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
  // Default to attention-first status order so error/transitioning pipelines
  // surface on page 1 and stopped ones sink, even on large clusters.
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
    () =>
      [...new Set(pipelines.flatMap((p) => p.tags.map((t) => `${t.key}:${t.value}`)))].map((v) => ({
        value: v,
        label: v,
      })),
    [pipelines]
  );

  const table = useReactTable({
    data: pipelines,
    columns,
    // Pipeline ids are unique and stable, so keying rows on them (rather than the
    // default row index) keeps a row's identity fixed while pages stream in and
    // the sort re-runs — React reuses each row's DOM for the same pipeline instead
    // of repainting a shifted window of them.
    getRowId: (row) => row.id,
    // No column-visibility UI on this page; disabling hiding also drops the Hide item from the column header menus.
    enableHiding: false,
    // Rows aren't selectable, which also drops the pagination footer's
    // "X of N row(s) selected." text — its ml-auto keeps the controls right-aligned.
    enableRowSelection: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    // Pages stream in while the list drains; autoResetPageIndex would yank the
    // user back to page 1 on every arrival. Filter and sort changes still
    // reset the page via the layout effect below, and a shrinking row set is
    // clamped before paint.
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

  // Only user actions (tabs, search, facets, sort) mutate filter state here, so
  // keying on columnFilters identity is a safe back-to-page-1 trigger.
  const { columnFilters } = table.getState();
  // biome-ignore lint/correctness/useExhaustiveDependencies: columnFilters and sorting are intentional change-triggers — when the user edits either, jump back to page 1 (autoResetPageIndex is off).
  useLayoutEffect(() => {
    if (table.getState().pagination.pageIndex !== 0) {
      table.setPageIndex(0);
    }
  }, [table, columnFilters, sorting]);

  const [activeTab, setActiveTab] = useState<PipelineStateTabId>('all');
  const [search, setSearch] = useState('');

  // GitHub-style tab counts: each tab shows how many rows selecting it would
  // yield under the current search/facets. The state column's faceted model
  // applies every filter except its own — exactly those semantics.
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
      // setFilterValue(undefined) on an unfiltered column still produces a new
      // columnFilters array, which would trip the page-reset effect — skip
      // writes that don't change anything (including the post-mount tick).
      if (column && column.getFilterValue() !== next) {
        column.setFilterValue(next);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, table]);

  // The status tabs are views, not filters — only search and the facet
  // pickers count toward "filtered" (and get wiped by Clear filters).
  const hasActiveFilters = columnFilters.some((f) => f.id !== 'state');
  const clearFilters = useCallback(() => {
    setSearch('');
    for (const columnId of ['name', 'inputs', 'outputs', 'tags']) {
      table.getColumn(columnId)?.setFilterValue(undefined);
    }
  }, [table]);

  const handleRowClick = useCallback(
    (pipelineId: string, event: MouseEvent<HTMLTableRowElement>) => {
      const target = event.target as Node;
      // Clicks on portaled children (menus, dialogs, tooltips) bubble through
      // the React tree but live outside the <tr> in the DOM — never navigate
      // for those, e.g. a click on the delete-confirm backdrop.
      if (!event.currentTarget.contains(target)) {
        return;
      }
      // Interactive descendants handle their own clicks. Same helper DataTable
      // uses for its row-click guard, so this row behaves like every other
      // clickable row and covers more than links and buttons.
      if (isInteractiveTarget(target, event.currentTarget)) {
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
    // enablePipelineDiagrams skips the wizard and goes straight to the editor.
    if (isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded()) {
      navigate({ to: '/rp-connect/create', search: {} as never });
    } else {
      navigate({ to: '/rp-connect/wizard', search: { step: undefined, serverless: undefined } });
    }
  }, [resetRpcnWizardStore, navigate]);

  // The hook keeps isLoading true until every page is drained; render as soon
  // as the first page has rows and stream the rest in behind the table. On a
  // mid-drain error the drain halts for good, so the error line replaces the
  // spinner rather than showing next to it.
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

  // With pages still unfetched the shown data is partial; otherwise a
  // background refresh failed and the data is merely stale.
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
              <TabsTrigger key={tab.id} value={tab.id} variant="underline">
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
          {(() => {
            if (rows.length === 0) {
              if (isLoadingMorePages) {
                return (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={columns.length}>
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Spinner /> Loading pipelines...
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              // Unfiltered but non-empty data means a stale page index is
              // about to be clamped — don't flash the empty-state message.
              let emptyText: string | null = null;
              if (hasActiveFilters) {
                emptyText = 'No pipelines match the current filters';
              } else if (activeTab !== 'all') {
                emptyText = PIPELINE_STATE_TABS.find((t) => t.id === activeTab)?.emptyText ?? null;
              } else if (pipelines.length === 0) {
                emptyText = 'You have no Redpanda Connect pipelines';
              }
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    {emptyText}
                  </TableCell>
                </TableRow>
              );
            }
            return rows.map((row) => (
              <TableRow
                className="cursor-pointer"
                data-state={row.getIsSelected() && 'selected'}
                key={row.id}
                onClick={(event) => handleRowClick(row.original.id, event)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell className="py-3" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ));
          })()}
        </TableBody>
      </Table>
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
          <TabsContent value="redpanda-connect">
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
