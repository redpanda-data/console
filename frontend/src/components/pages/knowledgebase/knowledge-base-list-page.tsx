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
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import type { KnowledgeBase } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import React, { useEffect } from 'react';
import { useListKnowledgeBasesQuery } from 'react-query/api/knowledge-base';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';

import { KnowledgeBaseActionsCell } from './knowledge-base-actions';

export type KnowledgeBaseTableRow = {
  id: string;
  displayName: string;
  description: string;
  tags: Record<string, string>;
};

const transformKnowledgeBase = (kb: KnowledgeBase): KnowledgeBaseTableRow => ({
  id: kb.id,
  displayName: kb.displayName,
  description: kb.description,
  tags: kb.tags || {},
});

export const createColumns = (setIsDeleteDialogOpen: (open: boolean) => void): ColumnDef<KnowledgeBaseTableRow>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
    cell: ({ row }) => (
      <Text className="font-mono" variant="default">
        {row.getValue('id')}
      </Text>
    ),
  },
  {
    accessorKey: 'displayName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Text className="font-medium" variant="default">
        {row.getValue('displayName')}
      </Text>
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => {
      const description = row.getValue('description') as string;
      return (
        <Text className="break-words" variant="muted">
          {description || '—'}
        </Text>
      );
    },
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.getValue('tags') as Record<string, string>;
      const tagEntries = Object.entries(tags);
      if (tagEntries.length === 0) {
        return <Text variant="muted">—</Text>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {tagEntries.map(([key, value]) => (
            <span
              className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 text-xs"
              key={key}
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
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => (
      <KnowledgeBaseActionsCell knowledgeBase={row.original} setIsDeleteDialogOpen={setIsDeleteDialogOpen} />
    ),
  },
];

function KnowledgeBaseDataTableToolbar({ table }: { table: TanstackTable<KnowledgeBaseTableRow> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[200px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => table.setGlobalFilter(event.target.value)}
          placeholder="Filter knowledge bases..."
          value={(table.getState().globalFilter as string) ?? ''}
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

export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Knowledge Bases';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({
      title: 'Knowledge Bases',
      linkTo: '/knowledgebases',
      heading: 'Knowledge Bases',
    });
  });
};

export const KnowledgeBaseListPage = () => {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const {
    data: knowledgeBasesData,
    isLoading,
    error,
  } = useListKnowledgeBasesQuery(
    {},
    {
      enabled: Features.pipelinesApi,
    }
  );

  const knowledgeBases = React.useMemo(
    () => knowledgeBasesData?.knowledgeBases?.map(transformKnowledgeBase) || [],
    [knowledgeBasesData]
  );

  useEffect(() => {
    updatePageTitle();
  }, []);

  useEffect(() => {
    if (error && Features.pipelinesApi) {
      const errorStr = String(error);
      if (!errorStr.includes('404')) {
        toast.error('Failed to load knowledge bases', {
          description: errorStr,
        });
      }
    }
  }, [error]);

  const handleRowClick = (knowledgeBaseId: string, event: React.MouseEvent) => {
    if (isDeleteDialogOpen) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-actions-column]') || target.closest('[role="menuitem"]') || target.closest('button')) {
      return;
    }
    navigate(`/knowledgebases/${encodeURIComponent(knowledgeBaseId)}`);
  };

  const columns = React.useMemo(() => createColumns(setIsDeleteDialogOpen), []);

  const table = useReactTable({
    data: knowledgeBases,
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
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const id = String(row.getValue('id')).toLowerCase();
      const displayName = String(row.getValue('displayName')).toLowerCase();
      const description = String(row.getValue('description')).toLowerCase();
      return id.includes(search) || displayName.includes(search) || description.includes(search);
    },
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
      globalFilter,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text variant="muted">
          Knowledge bases store and organize your documents, data, and content for AI-powered retrieval and chat. They
          enable Retrieval-Augmented Generation (RAG) by connecting language models with your specific information,
          providing accurate, contextual responses grounded in your data. Upload documents, configure embeddings, and
          create intelligent systems that can answer questions and provide insights from your knowledge repository.
        </Text>
      </div>
      <KnowledgeBaseDataTableToolbar table={table} />
      <div className="flex items-center justify-between">
        <DataTableViewOptions table={table} />
        <Button onClick={() => navigate('/knowledgebases/create')} size="sm" variant="secondary">
          <Plus className="h-4 w-4" />
          Create Knowledge Base
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
                      Loading knowledge bases...
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
            if (error && Features.pipelinesApi) {
              const errorStr = String(error);
              if (!errorStr.includes('404')) {
                return (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={columns.length}>
                      <div className="flex items-center justify-center gap-2 text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        Error loading knowledge bases: {errorStr}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
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
                  No knowledge bases found.
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
