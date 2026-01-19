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
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Check, Loader2, Pause, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import React, { useCallback, useEffect } from 'react';
import {
  type MCPServer as APIMCPServer,
  MCPServer_State,
  useDeleteMCPServerMutation,
  useListMCPServersQuery,
} from 'react-query/api/remote-mcp';
import { useDeleteSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { MCPActions } from './mcp-actions';
import { MCPDeleteHandler, type MCPDeleteHandlerRef } from './mcp-delete-handler';

const statusOptions = [
  { value: String(MCPServer_State.RUNNING), label: 'Running', icon: Check },
  { value: String(MCPServer_State.STARTING), label: 'Starting', icon: Loader2 },
  { value: String(MCPServer_State.STOPPING), label: 'Stopping', icon: Loader2 },
  { value: String(MCPServer_State.STOPPED), label: 'Stopped', icon: Pause },
  { value: String(MCPServer_State.ERROR), label: 'Error', icon: AlertCircle },
];

export type MCPServer = {
  id: string;
  name: string;
  url: string;
  state: (typeof MCPServer_State)[keyof typeof MCPServer_State];
  tools: string[];
  lastConnected?: string;
  tags?: Record<string, string>;
};

const StatusIcon = ({ state }: { state: (typeof MCPServer_State)[keyof typeof MCPServer_State] }) => {
  const statusPropsMap: Record<
    number,
    {
      text: string;
      icon: React.ComponentType<{ className?: string }>;
      iconColor: string;
      animate?: boolean;
    }
  > = {
    [MCPServer_State.RUNNING]: {
      text: 'Running',
      icon: Check,
      iconColor: 'text-green-600',
    },
    [MCPServer_State.STARTING]: {
      text: 'Starting',
      icon: Loader2,
      iconColor: 'text-blue-600',
      animate: true,
    },
    [MCPServer_State.STOPPING]: {
      text: 'Stopping',
      icon: Loader2,
      iconColor: 'text-orange-600',
      animate: true,
    },
    [MCPServer_State.STOPPED]: {
      text: 'Stopped',
      icon: Pause,
      iconColor: 'text-gray-600',
    },
    [MCPServer_State.ERROR]: {
      text: 'Error',
      icon: AlertCircle,
      iconColor: 'text-red-600',
    },
    [MCPServer_State.UNSPECIFIED]: {
      text: 'Unknown',
      icon: AlertCircle,
      iconColor: 'text-gray-500',
    },
  };

  const statusProps = statusPropsMap[state] || {
    text: 'Unknown',
    icon: AlertCircle,
    iconColor: 'text-red-600',
  };

  const IconComponent = statusProps.icon;

  return (
    <div className="flex items-center gap-2">
      <IconComponent className={`h-4 w-4 ${statusProps.iconColor} ${statusProps.animate ? 'animate-spin' : ''}`} />
      <span>{statusProps.text}</span>
    </div>
  );
};

// Transform API MCP server to component format
// No longer necessary once we have the proto layer reporting more details about the tools
const transformAPIMCPServer = (apiServer: APIMCPServer): MCPServer => {
  // Extract tool names from the actual API tools data
  const toolNames = Object.keys(apiServer.tools || {});

  return {
    id: apiServer.id,
    name: apiServer.displayName,
    url: apiServer.url,
    state: apiServer.state,
    tools: toolNames,
    tags: apiServer.tags,
  };
};

export const createColumns = (
  handleDeleteWithServiceAccount: (
    serverId: string,
    deleteServiceAccount: boolean,
    secretName: string | null,
    serviceAccountId: string | null
  ) => Promise<void>,
  isDeletingServer: boolean
): ColumnDef<MCPServer>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <Text className="font-medium">{row.getValue('name')}</Text>,
  },
  {
    accessorKey: 'tools',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tools" />,
    cell: ({ row }) => {
      const tools = row.getValue('tools') as string[];
      return (
        <div className="flex flex-wrap gap-1">
          {tools.map((tool) => (
            <span
              className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 text-xs"
              key={tool}
            >
              {tool}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'state',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusIcon state={row.getValue('state')} />,
    filterFn: (row, id, value) => value.includes(String(row.getValue(id))),
  },
  {
    accessorKey: 'url',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Server URL" />,
    cell: ({ row }) => {
      const url = row.getValue('url') as string;
      const truncatedUrl = url.length > 40 ? `${url.slice(0, 37)}...` : url;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Text className="cursor-help font-mono text-muted-foreground" variant="small">
              {truncatedUrl}
            </Text>
          </TooltipTrigger>
          <TooltipContent>
            <Text>{url}</Text>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const server = row.original;
      return (
        <MCPActions
          isDeletingServer={isDeletingServer}
          onDeleteWithServiceAccount={handleDeleteWithServiceAccount}
          server={server}
        />
      );
    },
  },
];

// Custom toolbar for MCP servers
function MCPDataTableToolbar({ table }: { table: TanstackTable<MCPServer> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[125px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          placeholder="Filter servers..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        />
        {table.getColumn('state') && (
          <DataTableFacetedFilter column={table.getColumn('state')} options={statusOptions} title="Status" />
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

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Remote MCP';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({
      title: 'Remote MCP',
      linkTo: '/mcp-servers',
      heading: 'Remote MCP',
    });
  });
};

const RemoteMCPListPageContent = ({ deleteHandlerRef }: { deleteHandlerRef: React.RefObject<MCPDeleteHandlerRef> }) => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // React Query hooks
  const { data: mcpServersData, isLoading, error } = useListMCPServersQuery({});
  const { mutateAsync: deleteMCPServer, isPending: isDeletingServer } = useDeleteMCPServerMutation();
  const { mutateAsync: deleteSecret } = useDeleteSecretMutation({
    skipInvalidation: true,
  });

  // Handler for deleting MCP server with optional service account deletion
  const handleDeleteWithServiceAccount = useCallback(
    async (
      serverId: string,
      deleteServiceAccountFlag: boolean,
      secretName: string | null,
      serviceAccountId: string | null
    ) => {
      try {
        // Delete MCP server (dataplane)
        await deleteMCPServer({ id: serverId });

        // If requested and we have the info, delete service account and secret
        if (deleteServiceAccountFlag && serviceAccountId && secretName) {
          // Delete service account (controlplane - via ref)
          await deleteHandlerRef.current?.deleteServiceAccount(serviceAccountId);

          // Delete secret (dataplane)
          await deleteSecret({ request: { id: secretName } });
        }

        // Show single success toast regardless of what was deleted
        toast.success('MCP server deleted successfully');
      } catch (deleteError) {
        const connectError = ConnectError.from(deleteError);
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: 'delete',
            entity: 'MCP server',
          })
        );
      }
    },
    [deleteMCPServer, deleteSecret, deleteHandlerRef]
  );

  // Transform API data to component format
  const mcpServers = React.useMemo(
    () => mcpServersData?.mcpServers?.map(transformAPIMCPServer) || [],
    [mcpServersData]
  );

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleRowClick = (serverId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('[data-actions-column]') ||
      target.closest('[role="menuitem"]') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="alertdialog"]') ||
      target.closest('button')
    ) {
      return;
    }
    navigate({ to: `/mcp-servers/${serverId}` });
  };

  const columns = React.useMemo(
    () => createColumns(handleDeleteWithServiceAccount, isDeletingServer),
    [handleDeleteWithServiceAccount, isDeletingServer]
  );

  const table = useReactTable({
    data: mcpServers,
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

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Heading level={1}>Remote MCP</Heading>
          <Text variant="muted">Manage your Model Context Protocol (MCP) servers.</Text>
        </header>
        <MCPDataTableToolbar table={table} />
        <div className="flex items-center justify-between">
          <DataTableViewOptions table={table} />
          <Button onClick={() => navigate({ to: '/mcp-servers/create' })} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            Create MCP Server
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
                        Loading MCP servers...
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
                        Error loading MCP servers: {error.message}
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
                    No MCP servers found.
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

export const RemoteMCPListPage = () => {
  const deleteHandlerRef = React.useRef<MCPDeleteHandlerRef>(null);

  return (
    <MCPDeleteHandler ref={deleteHandlerRef}>
      <RemoteMCPListPageContent deleteHandlerRef={deleteHandlerRef} />
    </MCPDeleteHandler>
  );
};
