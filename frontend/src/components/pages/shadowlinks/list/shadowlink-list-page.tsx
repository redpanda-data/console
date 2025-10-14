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

'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type Table as TanstackTable,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Check, Loader2, Pause, Plus, Trash2, X } from 'lucide-react';
import { runInAction } from 'mobx';
import { ShadowLinkState, ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { ShadowLink } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import React, { useEffect, useState } from 'react';
import {
  useDeleteShadowLinkMutation,
  useFailoverShadowLinkMutation,
  useListShadowLinksQuery,
} from 'react-query/api/shadowlink';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

const StatusIcon = ({ state }: { state: ShadowLinkState }) => {
  const statusProps = {
    [ShadowLinkState.ACTIVE]: {
      text: 'Active',
      icon: Check,
      iconColor: 'text-green-600',
    },
    [ShadowLinkState.PAUSED]: {
      text: 'Paused',
      icon: Pause,
      iconColor: 'text-gray-600',
    },
    [ShadowLinkState.UNSPECIFIED]: {
      text: 'Unknown',
      icon: AlertCircle,
      iconColor: 'text-gray-500',
    },
  }[state] || {
    text: 'Unknown',
    icon: AlertCircle,
    iconColor: 'text-gray-500',
  };

  const IconComponent = statusProps.icon;

  return (
    <div className="flex items-center gap-2">
      <IconComponent className={`h-4 w-4 ${statusProps.iconColor}`} />
      <span>{statusProps.text}</span>
    </div>
  );
};

export const createColumns = (setIsDeleteDialogOpen: (open: boolean) => void): ColumnDef<ShadowLink>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Text className="font-medium" variant="default">
        {row.getValue('name')}
      </Text>
    ),
  },
  {
    id: 'sourceCluster',
    accessorFn: (row) => row.configurations?.clientOptions?.bootstrapServers?.[0] || 'N/A',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Source Cluster" />,
    cell: ({ row }) => {
      const sourceCluster = row.original.configurations?.clientOptions?.bootstrapServers?.[0] || 'N/A';
      return (
        <Text className="font-mono text-muted-foreground" variant="small">
          {sourceCluster}
        </Text>
      );
    },
  },
  {
    id: 'status',
    accessorFn: (row) => row.status?.state,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusIcon state={row.original.status?.state || ShadowLinkState.UNSPECIFIED} />,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const shadowLink = row.original;

      // Check if any shadow topics are active
      const hasActiveTopics =
        shadowLink.status?.shadowTopicStatuses?.some((topic) => topic.state === ShadowTopicState.ACTIVE) ?? false;

      const [showFailoverDialog, setShowFailoverDialog] = useState(false);
      const [showDeleteDialog, setShowDeleteDialog] = useState(false);
      const [confirmationText, setConfirmationText] = useState('');

      const isDeleteConfirmed = confirmationText.toLowerCase() === 'delete';

      const { mutate: deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkMutation({
        onSuccess: () => {
          toast.success(`Shadowlink ${shadowLink.name} deleted`);
          setShowDeleteDialog(false);
          setConfirmationText('');
        },
        onError: (error) => {
          toast.error(`Failed to delete shadowlink: ${error.message}`);
        },
      });

      const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
        onSuccess: () => {
          toast.success(`Shadowlink ${shadowLink.name} failed over successfully`);
          setShowFailoverDialog(false);
        },
        onError: (error) => {
          toast.error(`Failed to failover: ${error.message}`);
          setShowFailoverDialog(false);
        },
      });

      const handleDelete = () => {
        if (isDeleteConfirmed) {
          deleteShadowLink({ name: shadowLink.name, force: false } as Parameters<typeof deleteShadowLink>[0]);
        }
      };

      const handleFailover = () => {
        failoverShadowLink({ name: shadowLink.name, shadowTopicName: '' } as Parameters<typeof failoverShadowLink>[0]);
      };

      return (
        <div className="flex items-center gap-2" data-actions-column>
          {/* Failover button - only when topics are active */}
          {hasActiveTopics && (
            <Button onClick={() => setShowFailoverDialog(true)} size="sm" variant="outline">
              Failover
            </Button>
          )}

          {/* Delete button - only when topics are NOT active */}
          {!hasActiveTopics && (
            <Button disabled={isDeleting} onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive">
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          )}

          {/* Delete confirmation dialog */}
          <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader className="text-left">
                <AlertDialogTitle>Delete Shadowlink</AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <Text>
                    You are about to delete <InlineCode>{shadowLink.name}</InlineCode>
                  </Text>
                  <Text>This action will cause data loss. To confirm, type "delete" into the confirmation box below.</Text>
                  <Input
                    className="mt-4"
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder='Type "delete" to confirm'
                    value={confirmationText}
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setConfirmationText('');
                    setShowDeleteDialog(false);
                  }}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  disabled={!isDeleteConfirmed || isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Failover confirmation dialog */}
          <AlertDialog onOpenChange={setShowFailoverDialog} open={showFailoverDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Failover Shadowlink?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to failover "{shadowLink.name}"? This will promote shadow topics to become
                  primary topics.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={isFailingOver} onClick={handleFailover}>
                  {isFailingOver ? 'Failing over...' : 'Failover'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    },
  },
];

// Custom toolbar for Shadowlinks
function ShadowLinkDataTableToolbar({ table }: { table: TanstackTable<ShadowLink> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[125px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          placeholder="Filter by name..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        />
        {isFiltered && (
          <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Update page title using uiState pattern
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Shadow Links';
    uiState.pageBreadcrumbs = [{ title: 'Shadow Links', linkTo: '/shadowlinks' }];
  });
};

export const ShadowLinkListPage = () => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  // React Query hooks
  const { data: shadowLinksData, isLoading, error } = useListShadowLinksQuery();

  // Get shadowlinks array from response
  const shadowLinks = React.useMemo(() => shadowLinksData?.shadowLinks || [], [shadowLinksData]);

  // Check if a shadowlink already exists (only one allowed)
  const hasShadowLink = shadowLinks.length > 0;

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleRowClick = (shadowLinkName: string, event: React.MouseEvent) => {
    // Don't navigate if delete dialog is open
    if (isDeleteDialogOpen) {
      return;
    }
    // Don't navigate if clicking on the actions dropdown or its trigger
    const target = event.target as HTMLElement;
    if (target.closest('[data-actions-column]') || target.closest('[role="menuitem"]') || target.closest('button')) {
      return;
    }
    navigate(`/shadowlinks/${shadowLinkName}`);
  };

  const columns = React.useMemo(() => createColumns(setIsDeleteDialogOpen), []);

  const table = useReactTable({
    data: shadowLinks,
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
        pageSize: 10,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  // Empty state when no shadowlinks exist
  if (!isLoading && !error && shadowLinks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card size="full">
          <CardHeader>
            <CardTitle>Create Shadowlink</CardTitle>
            <CardDescription>
              Set up shadow linking to replicate topics from a source cluster for disaster recovery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/shadowlinks/create')} testId="create-shadowlink-button">
              Create Shadowlink
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text variant="muted">
          Manage shadowlinks to replicate topics from source clusters for disaster recovery and high availability.
        </Text>
      </div>
      <ShadowLinkDataTableToolbar table={table} />
      <div className="flex items-center justify-between">
        <DataTableViewOptions table={table} />
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button disabled={hasShadowLink} onClick={() => navigate('/shadowlinks/create')} size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Create Shadowlink
              </Button>
            </span>
          </TooltipTrigger>
          {hasShadowLink && (
            <TooltipContent>
              <p>Only one shadowlink can be created at this time</p>
            </TooltipContent>
          )}
        </Tooltip>
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
        <TableBody className="[&_tr:hover]:bg-transparent">
          {(() => {
            if (isLoading) {
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading shadowlinks...
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
                      Error loading shadowlinks: {error.message}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
            if (table.getRowModel().rows?.length) {
              return table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer"
                  data-state={row.getIsSelected() && 'selected'}
                  data-testid={`shadowlink-row-${row.original.name}`}
                  key={row.id}
                  onClick={(event) => handleRowClick(row.original.name, event)}
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
                  No shadowlinks found.
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
