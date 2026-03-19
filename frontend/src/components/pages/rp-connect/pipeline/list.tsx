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

'use no memo';

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { Link as TanStackRouterLink, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { isSystemTag } from 'components/constants';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
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
import { Link, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { PIPELINE_STATE_OPTIONS, STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { AlertCircle, MoreHorizontal } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo } from 'react';
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

import { TabKafkaConnect } from '../../connect/overview';
import { parseConfigComponents } from '../utils/yaml';

type TagPair = { key: string; value: string };

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  configYaml: string;
  inputs: string[];
  processors: string[];
  outputs: string[];
  tags: TagPair[];
};

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => {
  const { inputs, processors, outputs } = parseConfigComponents(apiPipeline.configYaml);
  const tags = Object.entries(apiPipeline.tags)
    .filter(([k]) => !isSystemTag(k))
    .map(([key, value]) => ({ key, value }));
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    configYaml: apiPipeline.configYaml,
    inputs,
    processors,
    outputs,
    tags,
  };
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
    accessorKey: 'name',
    header: 'Pipeline Name',
    filterFn: createFilterFn('text'),
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
      </div>
    ),
  },
  {
    accessorKey: 'inputs',
    header: 'Input',
    filterFn: createFilterFn('multiOption'),
    cell: ({ row }) => {
      const inputs = row.getValue('inputs') as string[];
      if (inputs.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[184px]"
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {inputs.slice(-overflow.length).map((o) => (
                <ListItem key={o?.toString()}>{o}</ListItem>
              ))}
            </List>
          )}
        >
          {inputs.map((input) => (
            <Badge key={input} variant="neutral-inverted">
              {input}
            </Badge>
          ))}
        </BadgeGroup>
      );
    },
  },
  {
    accessorKey: 'processors',
    header: 'Processors',
    filterFn: createFilterFn('multiOption'),
    cell: ({ row }) => {
      const processors = row.getValue('processors') as string[];
      if (processors.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[184px]"
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {processors.slice(-overflow.length).map((o) => (
                <ListItem key={o?.toString()}>{o}</ListItem>
              ))}
            </List>
          )}
        >
          {processors.map((p) => (
            <Badge key={p} variant="neutral-inverted">
              {p}
            </Badge>
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
      const outputs = row.getValue('outputs') as string[];
      if (outputs.length === 0) {
        return null;
      }
      return (
        <BadgeGroup
          className="min-w-[184px]"
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {outputs.slice(-overflow.length).map((o) => (
                <ListItem key={o?.toString()}>{o}</ListItem>
              ))}
            </List>
          )}
        >
          {outputs.map((o) => (
            <Badge key={o} variant="neutral-inverted">
              {o}
            </Badge>
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
          className="min-w-[184px]"
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
    header: 'Status',
    filterFn: createFilterFn('option'),
    cell: ({ row }) => (
      <StatusBadge className="min-w-[150px]" variant={pipelineStateToStatusVariant[row.original.state]} />
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
  'use no memo';
  const navigate = useNavigate();
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();

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
    const processorOptions = [...new Set(pipelines.flatMap((p) => p.processors))].map((v) => ({
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
        id: 'processors',
        displayName: 'Processors',
        type: 'multiOption' as const,
        options: processorOptions,
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
    initialState: {
      pagination: {
        pageSize: PAGE_SIZE,
      },
    },
  });

  const { filters, actions } = useDataTableFilter({
    columns: filterColumns,
    table,
  });

  const handleCreateClick = useCallback(() => {
    resetOnboardingWizardStore();
    navigate({
      to: '/rp-connect/create',
      search: { serverless: undefined },
    });
  }, [resetOnboardingWizardStore, navigate]);

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
            const rows = table.getRowModel().rows;
            if (rows.length === 0) {
              const isFiltered = filters.length > 0;
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    {isFiltered ? 'No pipelines match the current filters' : 'You have no Redpanda Connect pipelines'}
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
      <DataTablePagination
        pagination={{
          canNextPage: table.getCanNextPage(),
          canPreviousPage: table.getCanPreviousPage(),
          pageCount: table.getPageCount(),
          pageIndex: table.getState().pagination.pageIndex,
          pageSize: table.getState().pagination.pageSize,
        }}
        table={table}
      />
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
