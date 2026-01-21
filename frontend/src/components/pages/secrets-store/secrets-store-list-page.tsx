/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { useNavigate } from '@tanstack/react-router';
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
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Heading, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, CircleUser, Link, Loader2, Server, Waypoints, X } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  ListSecretsFilterSchema,
  ListSecretsRequestSchema,
  Scope,
  type Secret,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import React, { useEffect } from 'react';
import { useDeleteSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { SecretScopeBadge } from './secret-scope-badge';
import { SecretsStoreActionsCell } from './secrets-store-actions';

export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Secrets Store';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({
      title: 'Secrets Store',
      linkTo: '/secrets',
      heading: 'Secrets Store',
    });
  });
};

export type SecretTableRow = {
  id: string;
  labels: Record<string, string>;
  scopes: Scope[];
  scope: string;
};

const transformSecret = (secret: Secret): SecretTableRow => ({
  id: secret.id,
  labels: secret.labels || {},
  scopes: secret.scopes || [],
  scope: '',
});

const scopeOptions = [
  { value: String(Scope.AI_GATEWAY), label: 'AI Gateway', icon: Waypoints },
  { value: String(Scope.MCP_SERVER), label: 'MCP Server', icon: MCPIcon },
  { value: String(Scope.AI_AGENT), label: 'AI Agent', icon: CircleUser },
  {
    value: String(Scope.REDPANDA_CONNECT),
    label: 'Redpanda Connect',
    icon: Link,
  },
  {
    value: String(Scope.REDPANDA_CLUSTER),
    label: 'Redpanda Cluster',
    icon: Server,
  },
];

type CreateColumnsOptions = {
  handleEdit: (id: string) => void;
  handleDelete: (id: string) => Promise<void>;
  isDeletingSecret: boolean;
};

export const createColumns = (options: CreateColumnsOptions): ColumnDef<SecretTableRow>[] => {
  const { handleEdit, handleDelete, isDeletingSecret } = options;
  return [
    {
      accessorKey: 'id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
      cell: ({ row }) => <Text className="font-medium">{row.getValue('id')}</Text>,
    },
    {
      accessorKey: 'labels',
      header: 'Labels',
      cell: ({ row }) => {
        const labels = row.getValue('labels') as Record<string, string>;
        const filteredLabels = Object.entries(labels).filter(
          ([key, value]) => !(key === 'owner' && value === 'console')
        );

        if (filteredLabels.length === 0) {
          return null;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {filteredLabels.map(([key, value]) => (
              <span
                className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 text-xs"
                key={`${key}-${value}`}
              >
                {key}: {value}
              </span>
            ))}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'scope',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scope" />,
      cell: ({ row }) => {
        const scopes = row.original.scopes;
        if (scopes.length === 0) {
          return null;
        }

        const getScopeDetails = (scope: Scope): { label: string; icon: React.ReactNode } => {
          const option = scopeOptions.find((opt) => opt.value === String(scope));
          if (!option) {
            return { label: 'Unknown', icon: null };
          }
          const IconComponent = option.icon;
          return {
            label: option.label,
            icon: IconComponent ? <IconComponent className="h-3 w-3" /> : null,
          };
        };

        return (
          <div className="flex flex-wrap gap-1">
            {scopes.slice(0, 2).map((scope) => (
              <SecretScopeBadge key={scope} scope={scope} />
            ))}
            {scopes.length > 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <Badge variant="secondary">+{scopes.length - 2} more</Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <List className="my-0">
                    {scopes.slice(2).map((scope) => {
                      const { label, icon } = getScopeDetails(scope);
                      return (
                        <ListItem key={scope}>
                          <span className="inline-flex items-center gap-1.5">
                            {icon}
                            <Text as="span" className="text-sm">
                              {label}
                            </Text>
                          </span>
                        </ListItem>
                      );
                    })}
                  </List>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
      filterFn: (row, _id, filterValue: string[]) => {
        const scopes = row.original.scopes;
        return filterValue.some((v) => scopes.some((s) => String(s) === v));
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const secret = row.original;
        return (
          <SecretsStoreActionsCell
            isDeleting={isDeletingSecret}
            onDelete={handleDelete}
            onEdit={handleEdit}
            secret={secret}
          />
        );
      },
    },
  ];
};

function SecretsStoreDataTableToolbar({ table }: { table: TanstackTable<SecretTableRow> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[200px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('id')?.setFilterValue(event.target.value)
          }
          placeholder="Filter by ID..."
          value={(table.getColumn('id')?.getFilterValue() as string) ?? ''}
        />
        {table.getColumn('scope') && (
          <DataTableFacetedFilter column={table.getColumn('scope')} options={scopeOptions} title="Scope" />
        )}
        {Boolean(isFiltered) && (
          <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export const SecretsStoreListPage = () => {
  const navigate = useNavigate();

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const {
    data: secretList,
    isLoading,
    error,
  } = useListSecretsQuery(
    create(ListSecretsRequestSchema, {
      filter: create(ListSecretsFilterSchema, {}),
    })
  );

  const { mutateAsync: deleteSecret, isPending: isDeletingSecret } = useDeleteSecretMutation();

  const secrets = React.useMemo(
    () => secretList?.secrets?.filter((s): s is Secret => s !== undefined).map(transformSecret) || [],
    [secretList]
  );

  const handleEdit = React.useCallback(
    (secretId: string) => {
      navigate({ to: `/secrets/${secretId}/edit` });
    },
    [navigate]
  );

  const handleDelete = React.useCallback(
    async (secretId: string) => {
      try {
        await deleteSecret({ request: { id: secretId } });
        toast.success('Secret deleted successfully');
      } catch (deleteError) {
        const connectError = ConnectError.from(deleteError);
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: 'delete',
            entity: 'secret',
          })
        );
      }
    },
    [deleteSecret]
  );

  const columns = React.useMemo(
    () =>
      createColumns({
        handleEdit,
        handleDelete,
        isDeletingSecret,
      }),
    [handleEdit, handleDelete, isDeletingSecret]
  );

  const table = useReactTable({
    data: secrets,
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

  useEffect(() => {
    updatePageTitle();
  }, []);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Heading level={1}>Secrets Store</Heading>
          <Text variant="muted">
            This page lets you list, edit, and delete the secrets used in your dataplane. You can create secrets on this
            page and reference them when creating a new resource such as Redpanda Connect pipelines.
          </Text>
        </header>
        <div className="mt-2 mb-4">
          <Button onClick={() => navigate({ to: '/secrets/create' })}>Create Secret</Button>
        </div>

        <div className="flex items-center justify-between">
          <SecretsStoreDataTableToolbar table={table} />
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
            {(() => {
              if (isLoading) {
                return (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={columns.length}>
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading secrets...
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
                        Error loading secrets: {String(error)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              if (table.getRowModel().rows?.length) {
                return table.getRowModel().rows.map((row) => (
                  <TableRow data-state={row.getIsSelected() && 'selected'} key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ));
              }
              return (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    No secrets found.
                  </TableCell>
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>

        <DataTablePagination table={table} />
      </div>
    </TooltipProvider>
  );
};
