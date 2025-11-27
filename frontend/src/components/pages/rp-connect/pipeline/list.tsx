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
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, Check, Loader2, Pause, Plus, Trash2 } from 'lucide-react';
import { DeletePipelineRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useMemo, useState } from 'react';
import { useDeletePipelineMutation, useListPipelinesQuery } from 'react-query/api/pipeline';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useResetOnboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
};

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => ({
  id: apiPipeline.id,
  name: apiPipeline.displayName,
  description: apiPipeline.description,
  state: apiPipeline.state,
});

const PipelineStatusBadge = ({ state }: { state: Pipeline_State }) => {
  const statusConfig = useMemo(() => {
    switch (state) {
      case PipelineState.RUNNING:
        return {
          variant: 'green' as const,
          icon: <Check className="h-3 w-3" />,
          text: 'Running',
        };
      case PipelineState.STARTING:
        return {
          variant: 'blue' as const,
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Starting',
        };
      case PipelineState.STOPPING:
        return {
          variant: 'orange' as const,
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Stopping',
        };
      case PipelineState.STOPPED:
        return {
          variant: 'gray' as const,
          icon: <Pause className="h-3 w-3" />,
          text: 'Stopped',
        };
      case PipelineState.COMPLETED:
        return {
          variant: 'green' as const,
          icon: <Check className="h-3 w-3" />,
          text: 'Completed',
        };
      case PipelineState.ERROR:
        return {
          variant: 'red' as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
        };
      case PipelineState.UNSPECIFIED:
        return {
          variant: 'gray' as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Unknown',
        };
      default:
        return {
          variant: 'gray' as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Unknown',
        };
    }
  }, [state]);

  return (
    <Badge icon={statusConfig.icon} variant={statusConfig.variant}>
      {statusConfig.text}
    </Badge>
  );
};

const PipelineListPageContent = () => {
  const navigate = useNavigate();
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const { data: pipelinesData, isLoading, error } = useListPipelinesQuery();
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();

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
    navigate('/rp-connect/wizard');
  }, [resetOnboardingWizardStore, navigate]);

  const handleRowClick = useCallback(
    (pipelineId: string, event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-actions-column]') || target.closest('button') || target.closest('a')) {
        return;
      }
      navigate(`/rp-connect/${pipelineId}`);
    },
    [navigate]
  );

  const columns = useMemo<ColumnDef<Pipeline>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link className="hover:underline" to={`/rp-connect/${encodeURIComponent(row.original.id)}`}>
            <Text variant="default">{row.getValue('id')}</Text>
          </Link>
        ),
        enableSorting: false,
        size: 120,
      },
      {
        accessorKey: 'name',
        header: 'Pipeline Name',
        cell: ({ row }) => (
          <Link className="hover:underline" to={`/rp-connect/${encodeURIComponent(row.original.id)}`}>
            <Text className="font-medium" variant="default">
              {row.getValue('name')}
            </Text>
          </Link>
        ),
        size: 250,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <Text className="max-w-md truncate">{row.getValue('description') || '-'}</Text>,
        enableSorting: false,
        size: 400,
      },
      {
        accessorKey: 'state',
        header: 'State',
        cell: ({ row }) => <PipelineStatusBadge state={row.getValue('state')} />,
        size: 120,
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
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
              <DeleteResourceAlertDialog
                buttonIcon={<Trash2 />}
                buttonText=""
                buttonVariant="ghost"
                isDeleting={isDeletingPipeline}
                onDelete={handleDelete}
                resourceId={row.original.id}
                resourceName={row.original.name}
                resourceType="Pipeline"
                triggerVariant="button"
              />
            </div>
          );
        },
        size: 60,
      },
    ],
    [deleteMutation, isDeletingPipeline]
  );

  const table = useReactTable({
    data: pipelines,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    state: {
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-4">
        <Button icon={<Plus />} onClick={handleCreateClick} size="sm">
          Create pipeline
        </Button>
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
            if (isLoading) {
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading pipelines...
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
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
            if (table.getRowModel().rows?.length) {
              return table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  data-state={row.getIsSelected() && 'selected'}
                  key={row.id}
                  onClick={(event) => handleRowClick(row.original.id, event)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ));
            }
            return (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  You have no Redpanda Connect pipelines
                </TableCell>
              </TableRow>
            );
          })()}
        </TableBody>
      </Table>
      <DataTablePagination table={table} />
    </div>
  );
};

export const PipelineListPage = () => <PipelineListPageContent />;
