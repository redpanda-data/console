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
import type {
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  Table as TanstackTable,
  VisibilityState,
} from '@tanstack/react-table';
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
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, MoreHorizontal, X } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo, useState } from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { useResetOnboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse as parseYaml } from 'yaml';

import { PIPELINE_STATE_OPTIONS, STARTABLE_STATES, STOPPABLE_STATES } from '../../../ui/pipeline/constants';
import {
  PipelineLogCountsProvider,
  usePipelineLogCountsContext,
} from '../../../ui/pipeline/pipeline-log-counts-context';
import { PipelineLogIndicator } from '../../../ui/pipeline/pipeline-log-indicator';
import { PipelineStatusBadge } from '../../../ui/pipeline/status-badge';
import { TabKafkaConnect } from '../../connect/overview';

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  configYaml: string;
  input?: string;
  output?: string;
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

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => {
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
// Cell Components - Use context to access log counts
// ============================================================================

type InputCellProps = {
  pipelineId: string;
  input: string | undefined;
};

/**
 * Input cell that displays the connector name and any input-scoped issues.
 */
const InputCell = memo(({ pipelineId, input }: InputCellProps) => {
  const { getCounts } = usePipelineLogCountsContext();
  const counts = getCounts(pipelineId);
  const inputCounts = counts?.input;
  const hasIssues = inputCounts ? inputCounts.errors > 0 || inputCounts.warnings > 0 : false;

  // Has input name - show name with optional indicator
  if (input) {
    return (
      <div className="flex items-center gap-2">
        <Text>{input}</Text>
        <PipelineLogIndicator counts={inputCounts} />
      </div>
    );
  }

  // No input name but has issues - show indicator only
  if (hasIssues) {
    return <PipelineLogIndicator counts={inputCounts} />;
  }

  // No input name and no issues - render nothing
  return null;
});

InputCell.displayName = 'InputCell';

type OutputCellProps = {
  pipelineId: string;
  output: string | undefined;
};

/**
 * Output cell that displays the connector name and any output-scoped issues.
 */
const OutputCell = memo(({ pipelineId, output }: OutputCellProps) => {
  const { getCounts } = usePipelineLogCountsContext();
  const counts = getCounts(pipelineId);
  const outputCounts = counts?.output;
  const hasIssues = outputCounts ? outputCounts.errors > 0 || outputCounts.warnings > 0 : false;

  // Has output name - show name with optional indicator
  if (output) {
    return (
      <div className="flex items-center gap-2">
        <Text>{output}</Text>
        <PipelineLogIndicator counts={outputCounts} />
      </div>
    );
  }

  // No output name but has issues - show indicator only
  if (hasIssues) {
    return <PipelineLogIndicator counts={outputCounts} />;
  }

  // No output name and no issues - render nothing
  return null;
});

OutputCell.displayName = 'OutputCell';

type IssuesCellProps = {
  pipelineId: string;
};

/**
 * Issues cell that displays root-level issues (not scoped to input/output).
 */
const IssuesCell = memo(({ pipelineId }: IssuesCellProps) => {
  const { getCounts } = usePipelineLogCountsContext();
  const counts = getCounts(pipelineId);
  return <PipelineLogIndicator counts={counts?.root} />;
});

IssuesCell.displayName = 'IssuesCell';

// ============================================================================
// Toolbar Component
// ============================================================================

type PipelineDataTableToolbarProps = {
  table: TanstackTable<Pipeline>;
  inputOptions: { label: string; value: string }[];
  outputOptions: { label: string; value: string }[];
};

const PipelineDataTableToolbar = ({ table, inputOptions, outputOptions }: PipelineDataTableToolbarProps) => {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[200px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          placeholder="Filter pipelines..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        />
        {table.getColumn('input') && inputOptions.length > 0 && (
          <DataTableFacetedFilter column={table.getColumn('input')} options={inputOptions} title="Input" />
        )}
        {table.getColumn('output') && outputOptions.length > 0 && (
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
            <X className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
};

// ============================================================================
// Skeleton Component
// ============================================================================

const PipelineTableSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-20" />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pipeline Name</TableHead>
          <TableHead>Input</TableHead>
          <TableHead>Output</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Issues</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map(() => (
          <TableRow key={crypto.randomUUID()}>
            <TableCell>
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-16" />
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
// Column Definitions - Stable, no log counts dependency
// ============================================================================

type CreateColumnsOptions = {
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
};

const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
}: CreateColumnsOptions): ColumnDef<Pipeline>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
    cell: ({ row }) => (
      <TanStackRouterLink
        className="text-[1rem] text-foreground underline decoration-dotted underline-offset-[3px]"
        params={{ pipelineId: encodeURIComponent(row.original.id) }}
        to="/rp-connect/$pipelineId"
      >
        {row.getValue('id')}
      </TanStackRouterLink>
    ),
    size: 120,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pipeline Name" />,
    cell: ({ row }) => (
      <TanStackRouterLink
        className="text-[1rem] text-foreground underline decoration-dotted underline-offset-[3px]"
        params={{ pipelineId: encodeURIComponent(row.original.id) }}
        to="/rp-connect/$pipelineId"
      >
        {row.getValue('name')}
      </TanStackRouterLink>
    ),
    filterFn: (row, _columnId, filterValue: string) => {
      const searchValue = filterValue.toLowerCase();
      const name = row.original.name?.toLowerCase() ?? '';
      const description = row.original.description?.toLowerCase() ?? '';
      const id = row.original.id?.toLowerCase() ?? '';
      return name.includes(searchValue) || description.includes(searchValue) || id.includes(searchValue);
    },
    size: 250,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => <Text className="max-w-md truncate">{row.getValue('description')}</Text>,
    size: 400,
  },
  {
    accessorKey: 'input',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Input" />,
    cell: ({ row }) => <InputCell input={row.getValue('input')} pipelineId={row.original.id} />,
    filterFn: (row, _columnId, filterValue: string[]) => {
      const input = row.original.input;
      if (!input) {
        return false;
      }
      return filterValue.includes(input);
    },
    size: 180,
  },
  {
    accessorKey: 'output',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Output" />,
    cell: ({ row }) => <OutputCell output={row.getValue('output')} pipelineId={row.original.id} />,
    filterFn: (row, _columnId, filterValue: string[]) => {
      const output = row.original.output;
      if (!output) {
        return false;
      }
      return filterValue.includes(output);
    },
    size: 180,
  },
  {
    accessorKey: 'state',
    header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
    cell: ({ row }) => <PipelineStatusBadge state={row.getValue('state')} />,
    filterFn: (row, _columnId, filterValue: string[]) => {
      const state = row.original.state;
      return filterValue.includes(String(state));
    },
    size: 120,
  },
  {
    id: 'issues',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Issues" />,
    cell: ({ row }) => <IssuesCell pipelineId={row.original.id} />,
    enableSorting: false,
    size: 150,
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
    size: 60,
  },
];

// ============================================================================
// Actions Cell - Extracted for cleaner column definition
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
            {canStart ? <DropdownMenuItem onClick={handleStart}>Start</DropdownMenuItem> : null}
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
// Table Content - Separated to receive visible pipeline IDs from parent
// ============================================================================

type PipelineTableContentProps = {
  table: TanstackTable<Pipeline>;
  columns: ColumnDef<Pipeline>[];
  error: Error | null;
};

const PipelineTableContent = ({ table, columns, error }: PipelineTableContentProps) => {
  const rows = table.getRowModel().rows;

  if (error) {
    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={columns.length}>
          <div className="flex items-center justify-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            Error loading pipelines: {error.message}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={columns.length}>
          You have no Redpanda Connect pipelines
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {rows.map((row: Row<Pipeline>) => (
        <TableRow data-state={row.getIsSelected() && 'selected'} key={row.id}>
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
};

// ============================================================================
// Main Pipeline List Component
// ============================================================================

const PipelineListPageContent = () => {
  const navigate = useNavigate();
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
    description: false,
  });
  const [rowSelection, setRowSelection] = useState({});

  const { data: pipelinesData, isLoading, error } = useListPipelinesQuery();
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

  const handleCreateClick = useCallback(() => {
    resetOnboardingWizardStore();
    navigate({
      to: '/rp-connect/wizard',
      search: { step: undefined, serverless: undefined },
    });
  }, [resetOnboardingWizardStore, navigate]);

  // Stable columns - no log counts dependency
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
      .map((output) => ({ label: output, value: output }));
  }, [pipelines]);

  const table = useReactTable({
    data: pipelines,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  // Get visible pipeline IDs from current page
  // This updates when pagination, sorting, or filtering changes
  const tableRows = table.getRowModel().rows;
  const visiblePipelineIds = useMemo(() => tableRows.map((row) => row.original.id), [tableRows]);

  if (isLoading) {
    return <PipelineTableSkeleton />;
  }

  return (
    <PipelineLogCountsProvider pipelineIds={visiblePipelineIds}>
      <div className="flex flex-col gap-4">
        <div className="mb-4">
          <Button onClick={handleCreateClick}>Create a pipeline</Button>
        </div>
        <div className="flex items-center justify-between">
          <PipelineDataTableToolbar inputOptions={inputOptions} outputOptions={outputOptions} table={table} />
          <DataTableViewOptions table={table} />
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
            <PipelineTableContent columns={columns} error={error} table={table} />
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </div>
    </PipelineLogCountsProvider>
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
