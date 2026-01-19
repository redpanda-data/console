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
import type { AIAgent as APIAIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import React, { useCallback, useEffect } from 'react';
import { useDeleteAIAgentMutation, useListAIAgentsQuery } from 'react-query/api/ai-agent';
import { useListMCPServersQuery } from 'react-query/api/remote-mcp';
import { useDeleteSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { AIAgentActions } from './ai-agent-actions';
import { AIAgentDeleteHandler, type AIAgentDeleteHandlerRef } from './ai-agent-delete-handler';
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
  providerType: 'openai' | 'anthropic' | 'google' | 'openaiCompatible';
  url?: string;
  mcpServers: Record<string, { id: string }>;
  tags: Record<string, string>;
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
  providerType: apiAgent.provider?.provider.case || 'openai',
  url: apiAgent.url,
  mcpServers: apiAgent.mcpServers,
  tags: apiAgent.tags,
});

type CreateColumnsOptions = {
  mcpServersMap: Map<string, { name: string; tools: string[] }>;
  handleDeleteWithServiceAccount: (
    agentId: string,
    deleteServiceAccount: boolean,
    secretName: string | null,
    serviceAccountId: string | null
  ) => Promise<void>;
  isDeletingAgent: boolean;
};

export const createColumns = (options: CreateColumnsOptions): ColumnDef<AIAgent>[] => {
  const { mcpServersMap, handleDeleteWithServiceAccount, isDeletingAgent } = options;

  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <Text className="font-medium">{row.getValue('name')}</Text>,
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
      cell: ({ row }) => (
        <AIAgentModel model={row.getValue('model')} providerType={row.original.providerType} size="sm" />
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <AIAgentActions
          agent={row.original}
          isDeletingAgent={isDeletingAgent}
          onDeleteWithServiceAccount={handleDeleteWithServiceAccount}
        />
      ),
    },
  ];
};

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
    uiState.pageTitle = 'AI Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({
      title: 'AI Agents',
      linkTo: '/agents',
      heading: 'AI Agents',
    });
  });
};

const AIAgentsListPageContent = ({
  deleteHandlerRef,
}: {
  deleteHandlerRef: React.RefObject<AIAgentDeleteHandlerRef>;
}) => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // React Query hooks
  const { data: aiAgentsData, isLoading, error } = useListAIAgentsQuery({});
  const { data: mcpServersData } = useListMCPServersQuery();
  const { mutateAsync: deleteAIAgent, isPending: isDeletingAgent } = useDeleteAIAgentMutation();
  const { mutateAsync: deleteSecret } = useDeleteSecretMutation({
    skipInvalidation: true,
  });

  // Handler for deleting agent with optional service account deletion
  const handleDeleteWithServiceAccount = useCallback(
    async (
      agentId: string,
      deleteServiceAccountFlag: boolean,
      secretName: string | null,
      serviceAccountId: string | null
    ) => {
      try {
        // Delete AI agent (dataplane)
        await deleteAIAgent({ id: agentId });

        // If requested and we have the info, delete service account and secret
        if (deleteServiceAccountFlag && serviceAccountId && secretName) {
          // Delete service account (controlplane - via ref)
          await deleteHandlerRef.current?.deleteServiceAccount(serviceAccountId);

          // Delete secret (dataplane)
          await deleteSecret({ request: { id: secretName } });
        }

        // Show single success toast regardless of what was deleted
        toast.success('AI agent deleted successfully');
      } catch (deleteError) {
        const connectError = ConnectError.from(deleteError);
        toast.error(
          formatToastErrorMessageGRPC({
            error: connectError,
            action: 'delete',
            entity: 'AI agent',
          })
        );
      }
    },
    [deleteAIAgent, deleteSecret, deleteHandlerRef]
  );

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
    navigate({ to: `/agents/${agentId}` });
  };

  const columns = React.useMemo(
    () =>
      createColumns({
        mcpServersMap,
        handleDeleteWithServiceAccount,
        isDeletingAgent,
      }),
    [mcpServersMap, handleDeleteWithServiceAccount, isDeletingAgent]
  );

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
        <header className="flex flex-col gap-2">
          <Heading level={1}>AI Agents</Heading>
          <Text variant="muted">Manage your AI agents with custom configurations and LLM providers.</Text>
        </header>
        <AIAgentDataTableToolbar table={table} />
        <div className="flex items-center justify-between">
          <DataTableViewOptions table={table} />
          <Button onClick={() => navigate({ to: '/agents/create' })}>
            Create AI Agent
            <Plus className="h-4 w-4" />
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

export const AIAgentsListPage = () => {
  const deleteHandlerRef = React.useRef<AIAgentDeleteHandlerRef>(null);

  return (
    <AIAgentDeleteHandler ref={deleteHandlerRef}>
      <AIAgentsListPageContent deleteHandlerRef={deleteHandlerRef} />
    </AIAgentDeleteHandler>
  );
};
