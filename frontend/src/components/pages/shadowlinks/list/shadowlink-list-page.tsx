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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, Check, Loader2, MoreHorizontal, Pause, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { ShadowLink } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import React, { useEffect } from 'react';
import { useDeleteShadowLinkMutation, useListShadowLinksQuery } from 'react-query/api/shadowlink';
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
      const { mutate: deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkMutation({
        onSuccess: () => {
          toast.success(`Shadowlink ${row?.original?.name} deleted`);
        },
        onError: (error) => {
          toast.error(`Failed to delete shadowlink: ${error.message}`);
        },
      });

      const shadowLink = row.original;

      const handleDelete = (name: string) => {
        // The mutation accepts a plain object with name and force properties
        deleteShadowLink({ name, force: false } as Parameters<typeof deleteShadowLink>[0]);
      };

      return (
        <div data-actions-column>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 data-[state=open]:bg-muted" size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DeleteResourceAlertDialog
                isDeleting={isDeleting}
                onDelete={handleDelete}
                onOpenChange={setIsDeleteDialogOpen}
                resourceId={shadowLink.name}
                resourceName={shadowLink.name}
                resourceType="Shadowlink"
              />
            </DropdownMenuContent>
          </DropdownMenu>
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
        <Button onClick={() => navigate('/shadowlinks/create')} size="sm" variant="secondary">
          <Plus className="h-4 w-4" />
          Create Shadowlink
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
                  className="cursor-pointer hover:bg-muted/50"
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
