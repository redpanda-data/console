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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Check, Copy, Loader2, MoreHorizontal, Pause, Play, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import type { MCPServer as APIMCPServer } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React, { useEffect } from 'react';
import {
  useDeleteMCPServerMutation,
  useListMCPServersQuery,
  useStartMCPServerMutation,
  useStopMCPServerMutation,
} from 'react-query/api/remote-mcp';
import { useNavigate } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { RemoteMCPDeleteAlertDialog } from '../delete-alert-dialog';

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
  state: MCPServer_State;
  tools: string[];
  lastConnected?: string;
};

const StatusIcon = ({ state }: { state: MCPServer_State }) => {
  const statusProps = {
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
  }[state] || {
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
  };
};

export const createColumns = (setIsDeleteDialogOpen: (open: boolean) => void): ColumnDef<MCPServer>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
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
              key={tool}
              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700"
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
    filterFn: (row, id, value) => {
      return value.includes(String(row.getValue(id)));
    },
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
            <div className="font-mono text-sm text-gray-600 cursor-help">{truncatedUrl}</div>
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
      const { mutate: deleteMCPServer, isPending: isDeleting } = useDeleteMCPServerMutation();
      const { mutate: startMCPServer, isPending: isStarting } = useStartMCPServerMutation();
      const { mutate: stopMCPServer, isPending: isStopping } = useStopMCPServerMutation();

      const server = row.original;

      const handleDelete = (id: string) => {
        deleteMCPServer({ id });
      };

      const handleCopy = () => {
        navigator.clipboard.writeText(server.url);
      };

      const handleStart = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        startMCPServer({ id: server.id });
      };

      const handleStop = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        stopMCPServer({ id: server.id });
      };

      const canStart = server.state === MCPServer_State.STOPPED || server.state === MCPServer_State.ERROR;
      const canStop = server.state === MCPServer_State.RUNNING;

      return (
        <div data-actions-column>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="data-[state=open]:bg-muted h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canStart && (
                <DropdownMenuItem onClick={handleStart}>
                  {isStarting ? (
                    <div className="flex items-center gap-4">
                      <Loader2 className="h-4 w-4 animate-spin" /> Starting
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Play className="h-4 w-4" />
                      Start Server
                    </div>
                  )}
                </DropdownMenuItem>
              )}
              {canStop && (
                <DropdownMenuItem onClick={handleStop}>
                  {isStopping ? (
                    <div className="flex items-center gap-4">
                      <Loader2 className="h-4 w-4 animate-spin" /> Stopping
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Pause className="h-4 w-4" /> Stop Server
                    </div>
                  )}
                </DropdownMenuItem>
              )}
              {(canStart || canStop) && <DropdownMenuSeparator />}
              <RemoteMCPDeleteAlertDialog
                resourceId={server.id}
                resourceName={server.name}
                resourceType="Remote MCP Server"
                onDelete={handleDelete}
                isDeleting={isDeleting}
                onOpenChange={setIsDeleteDialogOpen}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
          placeholder="Filter servers..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          className="h-8 w-[125px]"
        />
        {table.getColumn('state') && (
          <DataTableFacetedFilter column={table.getColumn('state')} title="Status" options={statusOptions} />
        )}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
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
    uiState.pageBreadcrumbs.push({ title: 'Remote MCP', linkTo: '/remote-mcp', heading: 'Remote MCP' });
  });
};

export const RemoteMCPListPage = () => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  // React Query hooks
  const { data: mcpServersData, isLoading, error } = useListMCPServersQuery({});

  // Transform API data to component format
  const mcpServers = React.useMemo(() => {
    return mcpServersData?.mcpServers?.map(transformAPIMCPServer) || [];
  }, [mcpServersData]);

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleRowClick = (serverId: string, event: React.MouseEvent) => {
    // Don't navigate if delete dialog is open
    if (isDeleteDialogOpen) {
      return;
    }
    // Don't navigate if clicking on the actions dropdown or its trigger
    const target = event.target as HTMLElement;
    if (target.closest('[data-actions-column]') || target.closest('[role="menuitem"]') || target.closest('button')) {
      return;
    }
    navigate(`/remote-mcp/${serverId}`);
  };

  const columns = React.useMemo(() => createColumns(setIsDeleteDialogOpen), []);

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
        <div>
          <Text variant="muted">Manage your Model Context Protocol (MCP) servers.</Text>
        </div>
        <MCPDataTableToolbar table={table} />
        <div className="flex items-center justify-between">
          <DataTableViewOptions table={table} />
          <Button size="sm" variant="secondary" onClick={() => navigate('/remote-mcp/create')}>
            <Plus className="mr-2 h-4 w-4" />
            Create new MCP Server
          </Button>
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading MCP servers...
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex items-center justify-center text-red-600">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Error loading MCP servers: {error.message}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={(event) => handleRowClick(row.original.id, event)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No MCP servers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </div>
    </TooltipProvider>
  );
};
