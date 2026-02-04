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
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  type Table as TanStackTable,
  useReactTable,
} from '@tanstack/react-table';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTableFacetedFilter, DataTablePagination } from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { isFeatureFlagEnabled } from 'config';
import { AlertCircle, MoreHorizontal, SearchIcon } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo, useState } from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { type PipelineLogCounts, useStreamingPipelineLogCounts } from 'react-query/api/pipeline-messages';
import { toast } from 'sonner';
import { useResetOnboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse as parseYaml } from 'yaml';

import { PIPELINE_STATE_OPTIONS, STARTABLE_STATES, STOPPABLE_STATES } from '../../../ui/pipeline/constants';
import { PipelineLogIndicator } from '../../../ui/pipeline/pipeline-log-indicator';
import { PipelineStatusBadge } from '../../../ui/pipeline/status-badge';
import { TabKafkaConnect } from '../../connect/overview';

// ============================================================================
// Types
// ============================================================================

type BasePipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  configYaml: string;
  input?: string;
  output?: string;
};

/**
 * Pipeline data enriched with streaming log counts.
 * This is the row data type used by TanStack Table.
 */
type Pipeline = BasePipeline & {
  logCounts?: PipelineLogCounts;
};

type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

const parseInputOutput = (configYaml: string): { input?: string; output?: string } => {
  if (!configYaml) {
    return {};
  }
  try {
    const config = parseYaml(configYaml) as ParsedYamlConfig | null;
    if (!config) {
      return {};
    }

    const inputObj = config.input;
    const outputObj = config.output;

    return {
      input: inputObj && typeof inputObj === 'object' ? Object.keys(inputObj)[0] : undefined,
      output: outputObj && typeof outputObj === 'object' ? Object.keys(outputObj)[0] : undefined,
    };
  } catch {
    return {};
  }
};

const transformAPIPipeline = (apiPipeline: APIPipeline): BasePipeline => {
  const { input, output } = parseInputOutput(apiPipeline.configYaml);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    configYaml: apiPipeline.configYaml,
    input,
    output,
  };
};

// ============================================================================
// Pagination Constants
// ============================================================================

const PAGE_SIZE = 20;

// ============================================================================
// Skeleton Component
// ============================================================================

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
        {Array.from({ length: 5 }).map(() => (
          <TableRow key={crypto.randomUUID()}>
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

// ============================================================================
// Actions Cell - Pipeline row actions dropdown
// ============================================================================

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
      <div className="flex justify-end" data-actions-column>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="size-8" size="icon" variant="secondary-ghost">
              <MoreHorizontal />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
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
            {isStopping ? <DropdownMenuItem onClick={handleStart}>Start</DropdownMenuItem> : null}
            {canStop ? <DropdownMenuItem onClick={handleStop}>Stop</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DeleteResourceAlertDialog
              buttonIcon={undefined}
              buttonText="Delete"
              buttonVariant="destructive-ghost"
              isDeleting={isDeletingPipeline}
              onDelete={handleDelete}
              resourceId={pipeline.id}
              resourceName={pipeline.name}
              resourceType="Pipeline"
              triggerVariant="dropdown"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

ActionsCell.displayName = 'ActionsCell';

// ============================================================================
// Toolbar Component - Filters
// ============================================================================

type PipelineListToolbarProps = {
  table: TanStackTable<Pipeline>;
  inputOptions: { label: string; value: string }[];
  outputOptions: { label: string; value: string }[];
};

const PipelineListToolbar = ({ table, inputOptions, outputOptions }: PipelineListToolbarProps) => {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-end gap-8">
        <div className="flex flex-col gap-1.5">
          <Label>Search</Label>
          <Input
            className="w-[200px]"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              table.getColumn('name')?.setFilterValue(event.target.value)
            }
            size="sm"
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          >
            <InputEnd>
              <SearchIcon className="-mt-0.5 size-4 text-muted-foreground" />
            </InputEnd>
          </Input>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Filters</Label>
          <div className="flex gap-2">
            {inputOptions.length > 0 && table.getColumn('input') && (
              <DataTableFacetedFilter column={table.getColumn('input')} options={inputOptions} title="Input" />
            )}
            {outputOptions.length > 0 && table.getColumn('output') && (
              <DataTableFacetedFilter column={table.getColumn('output')} options={outputOptions} title="Output" />
            )}
            {table.getColumn('state') && (
              <DataTableFacetedFilter
                column={table.getColumn('state')}
                options={[...PIPELINE_STATE_OPTIONS]}
                title="State"
              />
            )}
            {isFiltered ? (
              <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Table Columns
// ============================================================================

type CreateColumnsOptions = {
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
  isNewPipelineLogsEnabled: boolean;
};

const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
  isNewPipelineLogsEnabled,
}: CreateColumnsOptions): ColumnDef<Pipeline>[] => [
  {
    accessorKey: 'name',
    header: 'Pipeline Name',
    cell: ({ row }) => (
      <div className="flex min-w-[324px] items-center gap-4">
        <Link
          as={TanStackRouterLink}
          className="max-w-[200px] text-base text-primary text-truncate"
          params={{ pipelineId: encodeURIComponent(row.original.id) }}
          to="/rp-connect/$pipelineId"
        >
          {row.getValue('name')}
        </Link>
        {isNewPipelineLogsEnabled ? <PipelineLogIndicator counts={row.original.logCounts?.root} /> : null}
      </div>
    ),
    filterFn: (row, _id, filterValue: string) => {
      const searchLower = filterValue.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(searchLower) ||
        row.original.id.toLowerCase().includes(searchLower) ||
        row.original.description.toLowerCase().includes(searchLower)
      );
    },
  },
  {
    accessorKey: 'input',
    header: 'Input',
    cell: ({ row }) => {
      const input = row.getValue('input') as string | undefined;
      return (
        <div className="flex min-w-[184px] items-center gap-4">
          {input ? <Badge variant="neutral-inverted">{input}</Badge> : null}
          {isNewPipelineLogsEnabled ? <PipelineLogIndicator counts={row.original.logCounts?.input} /> : null}
        </div>
      );
    },
    filterFn: (row, _id, filterValue: string[]) => {
      if (filterValue.length === 0) {
        return true;
      }
      return Boolean(row.original.input && filterValue.includes(row.original.input));
    },
  },
  {
    accessorKey: 'output',
    header: 'Output',
    cell: ({ row }) => {
      const output = row.getValue('output') as string | undefined;
      return (
        <div className="flex min-w-[176px] items-center gap-2">
          {output ? <Badge variant="neutral-inverted">{output}</Badge> : null}
          {isNewPipelineLogsEnabled ? <PipelineLogIndicator counts={row.original.logCounts?.output} /> : null}
        </div>
      );
    },
    filterFn: (row, _id, filterValue: string[]) => {
      if (filterValue.length === 0) {
        return true;
      }
      return Boolean(row.original.output && filterValue.includes(row.original.output));
    },
  },
  {
    accessorKey: 'state',
    header: 'Status',
    cell: ({ row }) => <PipelineStatusBadge state={row.original.state} />,
    filterFn: (row, _id, filterValue: string[]) => {
      if (filterValue.length === 0) {
        return true;
      }
      return filterValue.includes(String(row.original.state));
    },
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

// ============================================================================
// Main Pipeline List Component
// ============================================================================

const PipelineListPageContent = () => {
  const navigate = useNavigate();
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();

  // Table state
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const {
    data: pipelinesData,
    isLoading,
    error,
  } = useListPipelinesQuery(undefined, {
    enableSmartPolling: true,
  });
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();
  const isNewPipelineLogsEnabled = isFeatureFlagEnabled('enableNewPipelineLogs');

  // Transform API data to base pipeline objects
  const basePipelines = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(transformAPIPipeline),
    [pipelinesData]
  );

  // Get all pipeline IDs for streaming log counts
  const allPipelineIds = useMemo(() => basePipelines.map((p) => p.id), [basePipelines]);
  const { counts } = useStreamingPipelineLogCounts(allPipelineIds, isNewPipelineLogsEnabled);

  // Enrich pipelines with log counts - this is the table's data source
  const pipelines: Pipeline[] = useMemo(
    () => basePipelines.map((p) => ({ ...p, logCounts: counts.get(p.id) })),
    [basePipelines, counts]
  );

  // Memoize columns to avoid re-renders
  const columns = useMemo(
    () =>
      createColumns({
        navigate,
        deleteMutation,
        startMutation,
        stopMutation,
        isDeletingPipeline,
        isNewPipelineLogsEnabled,
      }),
    [navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline, isNewPipelineLogsEnabled]
  );

  const table = useReactTable({
    data: pipelines,
    columns,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: {
      pagination: {
        pageSize: PAGE_SIZE,
      },
    },
    state: {
      columnFilters,
    },
  });

  const handleCreateClick = useCallback(() => {
    resetOnboardingWizardStore();
    navigate({
      to: '/rp-connect/wizard',
      search: { step: undefined, serverless: undefined },
    });
  }, [resetOnboardingWizardStore, navigate]);

  // Generate filter options from pipeline data
  const inputOptions = useMemo(() => {
    const uniqueInputs = new Set<string>();
    for (const pipeline of pipelines) {
      if (pipeline.input) {
        uniqueInputs.add(pipeline.input);
      }
    }
    return Array.from(uniqueInputs)
      .sort()
      .map((input) => ({ label: input, value: input }));
  }, [pipelines]);

  const outputOptions = useMemo(() => {
    const uniqueOutputs = new Set<string>();
    for (const pipeline of pipelines) {
      if (pipeline.output) {
        uniqueOutputs.add(pipeline.output);
      }
    }
    return Array.from(uniqueOutputs)
      .sort()
      .map((output) => ({
        label: output,
        value: output,
      }));
  }, [pipelines]);

  if (isLoading) {
    return <PipelineListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-red-600">
        <AlertCircle className="h-4 w-4" />
        Error loading pipelines: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-4">
        <Button onClick={handleCreateClick}>Create a pipeline</Button>
      </div>
      <PipelineListToolbar inputOptions={inputOptions} outputOptions={outputOptions} table={table} />
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
            const rows = table.getRowModel().rows;
            if (rows.length === 0) {
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    {basePipelines.length === 0
                      ? 'You have no Redpanda Connect pipelines'
                      : 'No pipelines match your filters'}
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
      <div className="flex items-center justify-between gap-2">
        {isNewPipelineLogsEnabled ? (
          <Text variant="muted">
            † Log counts are derived from a sample of recent pipeline logs and may not reflect the complete historical
            data.
          </Text>
        ) : null}
        <DataTablePagination hidePageSizeSelector table={table} />
      </div>
    </div>
  );
};

// ============================================================================
// Page Wrapper Components
// ============================================================================

const RedpandaConnectContent = () => (
  <div className="flex flex-col gap-4">
    <Text>
      Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that drive
      real-time analytics and actionable business insights. Integrate data across systems with hundreds of prebuilt
      connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.{' '}
      <Link href="https://docs.redpanda.com/redpanda-connect/home/" target="_blank">
        Learn more
      </Link>
    </Text>
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
            <Text variant="muted">Checking for Kafka Connect availability...</Text>
          </div>
        ) : null}
        <RedpandaConnectContent />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Text>
        There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and Kafka
        Connect.
      </Text>
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
              <Text>
                Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data with
                different data systems.{' '}
                <Link href="https://docs.redpanda.com/redpanda-cloud/develop/managed-connectors/" target="_blank">
                  Learn more
                </Link>
              </Text>
              <TabKafkaConnect />
            </div>
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
  );
};
