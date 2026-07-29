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
import type { ColumnDef, SortingState } from '@tanstack/react-table';
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
import { DataTableColumnHeader, DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { StatusDot } from 'components/redpanda-ui/components/status-dot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, List, ListItem } from 'components/redpanda-ui/components/typography';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
import { PIPELINE_STATE_OPTIONS, STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import { AlertCircle, Box, MoreHorizontal } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
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

/**
 * Pairs each name with a unique React key by suffixing its occurrence index,
 * since component names can repeat (e.g. two `redpanda` inputs).
 *
 * @param names - Component names, possibly containing duplicates.
 * @returns One entry per input name, e.g. `["redpanda", "redpanda"]` →
 *   `[{ name: "redpanda", key: "redpanda-0" }, { name: "redpanda", key: "redpanda-1" }]`.
 */
const toKeyedNames = (names: string[]): { name: string; key: string }[] => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const occurrence = seen.get(name) ?? 0;
    seen.set(name, occurrence + 1);
    return { name, key: `${name}-${occurrence}` };
  });
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
const pipelineStateFilterIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  [String(Pipeline_State.COMPLETED)]: (props) => <StatusDot variant="success" {...props} />,
  [String(Pipeline_State.STARTING)]: (props) => <Spinner className={cn('text-success', props.className)} />,
  [String(Pipeline_State.STOPPING)]: (props) => <Spinner className={cn('text-destructive', props.className)} />,
  [String(Pipeline_State.STOPPED)]: (props) => <StatusDot variant="disabled" {...props} />,
  [String(Pipeline_State.ERROR)]: (props) => <StatusDot variant="error" {...props} />,
  [String(Pipeline_State.RUNNING)]: (props) => <StatusDot variant="success" {...props} />,
  [String(Pipeline_State.UNSPECIFIED)]: (props) => <StatusDot variant="disabled" {...props} />,
};

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

const ComponentBadge = ({ name }: { name: string }) => (
  <Badge variant="neutral-inverted">
    <ConnectorLogo className="size-3.5" fallback={Box} name={name as ComponentName} />
    {name}
  </Badge>
);

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
    filterFn: createFilterFn('text'),
    cell: ({ row }) => {
      const id = row.original.id;
      const name = row.getValue('name') as string;
      return (
        <div className="flex max-w-[200px] flex-col gap-0.5 overflow-hidden">
          <Link
            as={TanStackRouterLink}
            className="block truncate text-base text-primary"
            params={{ pipelineId: encodeURIComponent(id) }}
            title={name}
            to="/rp-connect/$pipelineId"
          >
            {name}
          </Link>
          {id !== name ? (
            <span className="truncate font-mono text-muted-foreground text-xs" title={id}>
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
    filterFn: createFilterFn('multiOption'),
    cell: ({ row }) => {
      const inputs = toKeyedNames(row.getValue('inputs') as string[]);
      if (inputs.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[174px]"
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {inputs.slice(-overflow.length).map((o) => (
                <ListItem key={o.key}>{o.name}</ListItem>
              ))}
            </List>
          )}
        >
          {inputs.map((input) => (
            <ComponentBadge key={input.key} name={input.name} />
          ))}
        </BadgeGroup>
      );
    },
  },
  {
    accessorKey: 'outputs',
    header: 'Output',
    filterFn: createFilterFn('multiOption'),
    cell: ({ row }) => {
      const outputs = toKeyedNames(row.getValue('outputs') as string[]);
      if (outputs.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[174px]"
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {outputs.slice(-overflow.length).map((o) => (
                <ListItem key={o.key}>{o.name}</ListItem>
              ))}
            </List>
          )}
        >
          {outputs.map((o) => (
            <ComponentBadge key={o.key} name={o.name} />
          ))}
        </BadgeGroup>
      );
    },
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags.map((t) => `${t.key}:${t.value}`),
    header: 'Tags',
    filterFn: createFilterFn('multiOption'),
    cell: ({ row }) => {
      const tags = row.original.tags;
      if (tags.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[174px]"
          maxVisible={3}
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
    filterFn: createFilterFn('option'),
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

  const filterColumns = useMemo<FilterColumnConfig[]>(() => {
    const inputOptions = [...new Set(pipelines.flatMap((p) => p.inputs))].map((v) => ({
      value: v,
      label: v,
    }));
    const outputOptions = [...new Set(pipelines.flatMap((p) => p.outputs))].map((v) => ({
      value: v,
      label: v,
    }));
    const tagOptions = [...new Set(pipelines.flatMap((p) => p.tags.map((t) => `${t.key}:${t.value}`)))].map((v) => ({
      value: v,
      label: v,
    }));
    const stateOptions = PIPELINE_STATE_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
      icon: pipelineStateFilterIcon[o.value],
    }));

    return [
      {
        id: 'name',
        displayName: 'Name',
        type: 'text' as const,
        placeholder: 'Search by name...',
      },
      {
        id: 'inputs',
        displayName: 'Input',
        type: 'multiOption' as const,
        options: inputOptions,
      },
      {
        id: 'outputs',
        displayName: 'Output',
        type: 'multiOption' as const,
        options: outputOptions,
      },
      {
        id: 'tags',
        displayName: 'Tag',
        displayNamePlural: 'Tags',
        type: 'multiOption' as const,
        options: tagOptions,
      },
      {
        id: 'state',
        displayName: 'Status',
        displayNamePlural: 'Statuses',
        type: 'option' as const,
        options: stateOptions,
      },
    ];
  }, [pipelines]);

  const table = useReactTable({
    data: pipelines,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    // Pages stream in while the list drains; autoResetPageIndex would yank the
    // user back to page 1 on every arrival. Filter and sort changes still
    // reset the page (layout effect below, keyed on user-facing filter state —
    // table columnFilters churn identity on every data refresh), and a
    // shrinking row set is clamped before paint.
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

  const { filters, actions } = useDataTableFilter({
    columns: filterColumns,
    table,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: filters and sorting are intentional change-triggers — when the user edits either, jump back to page 1 (autoResetPageIndex is off).
  useLayoutEffect(() => {
    if (table.getState().pagination.pageIndex !== 0) {
      table.setPageIndex(0);
    }
  }, [table, filters, sorting]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DataTableFilter actions={actions} columns={filterColumns} filters={filters} table={table} />
        <Button onClick={handleCreateClick}>Create a pipeline</Button>
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
              if (filters.length > 0) {
                emptyText = 'No pipelines match the current filters';
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
              <TableRow data-state={row.getIsSelected() && 'selected'} key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ));
          })()}
        </TableBody>
      </Table>
      {isLoadingMorePages && rows.length > 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner /> Loading more pipelines...
        </div>
      ) : null}
      {error && pipelines.length > 0 ? (
        <div className="flex items-center gap-2 text-error text-sm">
          <AlertCircle className="h-4 w-4" />
          {/* With pages still unfetched the shown data is partial; otherwise a
              background refresh failed and the data is merely stale. */}
          {hasNextPage
            ? `Failed to load all pipelines: ${error.message}`
            : `Couldn't refresh pipelines: ${error.message}`}
        </div>
      ) : null}
      {/* Hide the pagination footer's "X of N selected" text (no row selection here) but keep its space so controls stay right-aligned. */}
      <div className="[&>div>div:first-child]:invisible">
        <DataTablePagination table={table} />
      </div>
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
