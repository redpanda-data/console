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
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, Check, Copy, Loader2, MoreHorizontal, Pause, Play, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import type { AIAgent as APIAIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import React, { useEffect } from 'react';
import {
  useDeleteAIAgentMutation,
  useListAIAgentsQuery,
  useStartAIAgentMutation,
  useStopAIAgentMutation,
} from 'react-query/api/ai-agent';
import { useListMCPServersQuery } from 'react-query/api/remote-mcp';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { AIAgentModel } from '../ai-agent-model';

const statusOptions = [
  { value: String(AIAgent_State.RUNNING), label: 'Running', icon: Check },
  { value: String(AIAgent_State.STARTING), label: 'Starting', icon: Loader2 },
  { value: String(AIAgent_State.STOPPING), label: 'Stopping', icon: Loader2 },
  { value: String(AIAgent_State.STOPPED), label: 'Stopped', icon: Pause },
  { value: String(AIAgent_State.ERROR), label: 'Error', icon: AlertCircle },
];

export type AIAgent = {
  id: string;
  name: string;
  description: string;
  state: AIAgent_State;
  model: string;
  url?: string;
  mcpServers: Record<string, { id: string }>;
};

const StatusIcon = ({ state }: { state: AIAgent_State }) => {
  const statusProps = {
    [AIAgent_State.RUNNING]: {
      text: 'Running',
      icon: Check,
      iconColor: 'text-green-600',
    },
    [AIAgent_State.STARTING]: {
      text: 'Starting',
      icon: Loader2,
      iconColor: 'text-blue-600',
      animate: true,
    },
    [AIAgent_State.STOPPING]: {
      text: 'Stopping',
      icon: Loader2,
      iconColor: 'text-orange-600',
      animate: true,
    },
    [AIAgent_State.STOPPED]: {
      text: 'Stopped',
      icon: Pause,
      iconColor: 'text-gray-600',
    },
    [AIAgent_State.ERROR]: {
      text: 'Error',
      icon: AlertCircle,
      iconColor: 'text-red-600',
    },
    [AIAgent_State.UNSPECIFIED]: {
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

// Transform API AI agent to component format
const transformAPIAIAgent = (apiAgent: APIAIAgent): AIAgent => ({
  id: apiAgent.id,
  name: apiAgent.displayName,
  description: apiAgent.description,
  state: apiAgent.state,
  model: apiAgent.model,
  url: apiAgent.url,
  mcpServers: apiAgent.mcpServers,
});

export const createColumns = (
  setIsDeleteDialogOpen: (open: boolean) => void,
  mcpServersMap: Map<string, { name: string; tools: string[] }>
): ColumnDef<AIAgent>[] => [
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
    id: 'tools',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tools" />,
    cell: ({ row }) => {
      const agent = row.original;
      const mcpServerIds = Object.values(agent.mcpServers || {}).map((server) => server.id);

      if (mcpServerIds.length === 0) {
        return null;
      }

      // Collect all tools from all connected MCP servers
      const allTools: string[] = [];
      for (const serverId of mcpServerIds) {
        const mcpServer = mcpServersMap.get(serverId);
        if (mcpServer?.tools) {
          allTools.push(...mcpServer.tools);
        }
      }

      if (allTools.length === 0) {
        return null;
      }

      return (
        <div className="flex flex-wrap gap-1">
          {allTools.slice(0, 3).map((toolName) => (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs" key={toolName}>
              {toolName}
            </span>
          ))}
          {allTools.length > 3 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                  +{allTools.length - 3} more
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  {allTools.slice(3).map((toolName) => (
                    <Text key={toolName} variant="small">
                      • {toolName}
                    </Text>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
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
    accessorKey: 'model',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
    cell: ({ row }) => <AIAgentModel model={row.getValue('model')} size="sm" />,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const { mutate: deleteAIAgent, isPending: isDeleting } = useDeleteAIAgentMutation({
        onSuccess: () => {
          toast.success(`AI agent ${row?.original?.name} deleted`);
        },
      });
      const { mutate: startAIAgent, isPending: isStarting } = useStartAIAgentMutation();
      const { mutate: stopAIAgent, isPending: isStopping } = useStopAIAgentMutation();

      const agent = row.original;

      const handleDelete = (id: string) => {
        deleteAIAgent({ id });
      };

      const handleCopy = () => {
        if (agent.url) {
          navigator.clipboard.writeText(agent.url);
          toast.success('URL copied to clipboard');
        }
      };

      const handleStart = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        startAIAgent({ id: agent.id });
      };

      const handleStop = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        stopAIAgent({ id: agent.id });
      };

      const canStart = agent.state === AIAgent_State.STOPPED || agent.state === AIAgent_State.ERROR;
      const canStop = agent.state === AIAgent_State.RUNNING;

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
              {agent.url && (
                <>
                  <DropdownMenuItem onClick={handleCopy}>
                    <div className="flex items-center gap-4">
                      <Copy className="h-4 w-4" /> Copy URL
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {canStart && (
                <DropdownMenuItem onClick={handleStart}>
                  {isStarting ? (
                    <div className="flex items-center gap-4">
                      <Loader2 className="h-4 w-4 animate-spin" /> Starting
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Play className="h-4 w-4" />
                      Start Agent
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
                      <Pause className="h-4 w-4" /> Stop Agent
                    </div>
                  )}
                </DropdownMenuItem>
              )}
              {(canStart || canStop) && <DropdownMenuSeparator />}
              <DeleteResourceAlertDialog
                isDeleting={isDeleting}
                onDelete={handleDelete}
                onOpenChange={setIsDeleteDialogOpen}
                resourceId={agent.id}
                resourceName={agent.name}
                resourceType="AI Agent"
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];

// Custom toolbar for AI agents
function AIAgentDataTableToolbar({ table }: { table: TanstackTable<AIAgent> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[125px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          placeholder="Filter agents..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        />
        {table.getColumn('state') && (
          <DataTableFacetedFilter column={table.getColumn('state')} options={statusOptions} title="Status" />
        )}
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

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'AI Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'AI Agents', linkTo: '/agents', heading: 'AI Agents' });
  });
};

export const AIAgentsListPage = () => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  // React Query hooks
  const { data: aiAgentsData, isLoading, error } = useListAIAgentsQuery({});
  const { data: mcpServersData } = useListMCPServersQuery();

  // Transform API data to component format
  const aiAgents = React.useMemo(() => aiAgentsData?.aiAgents?.map(transformAPIAIAgent) || [], [aiAgentsData]);

  // Build a map of MCP server ID -> { name, tools }
  const mcpServersMap = React.useMemo(() => {
    const map = new Map<string, { name: string; tools: string[] }>();
    if (mcpServersData?.mcpServers) {
      for (const server of mcpServersData.mcpServers) {
        map.set(server.id, {
          name: server.displayName,
          tools: Object.keys(server.tools || {}),
        });
      }
    }
    return map;
  }, [mcpServersData]);

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleRowClick = (agentId: string, event: React.MouseEvent) => {
    // Don't navigate if delete dialog is open
    if (isDeleteDialogOpen) {
      return;
    }
    // Don't navigate if clicking on the actions dropdown or its trigger
    const target = event.target as HTMLElement;
    if (target.closest('[data-actions-column]') || target.closest('[role="menuitem"]') || target.closest('button')) {
      return;
    }
    navigate(`/agents/${agentId}`);
  };

  const columns = React.useMemo(() => createColumns(setIsDeleteDialogOpen, mcpServersMap), [mcpServersMap]);

  const table = useReactTable({
    data: aiAgents,
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
          <Text variant="muted">Manage your AI agents with custom configurations and LLM providers.</Text>
        </div>
        <AIAgentDataTableToolbar table={table} />
        <div className="flex items-center justify-between">
          <DataTableViewOptions table={table} />
          <Button onClick={() => navigate('/agents/create')} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            Create AI Agent
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
                        Loading AI agents...
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
                        Error loading AI agents: {error.message}
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
                    No AI agents found.
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
