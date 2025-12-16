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
import CohereLogo from 'assets/cohere.svg';
import OpenAILogo from 'assets/openai.svg';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableViewOptions,
} from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import type { KnowledgeBase } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useDeleteKnowledgeBaseMutation, useListKnowledgeBasesQuery } from 'react-query/api/knowledge-base';
import { useListTopicsQuery } from 'react-query/api/topic';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { KnowledgeBaseActionsCell } from './knowledge-base-actions';
import {
  ALL_EMBEDDING_MODELS,
  COHERE_RERANKER_MODELS,
  type EmbeddingModel,
  type RerankerModel,
} from '../../../ui/ai/ai-constants';
import { isRegexPattern, stripRegexPrefix } from '../create/schemas';

// Icon wrapper components for provider logos
const OpenAIIcon = ({ className }: { className?: string }) => (
  <img alt="OpenAI" className={className} src={OpenAILogo} />
);

const CohereIcon = ({ className }: { className?: string }) => (
  <img alt="Cohere" className={className} src={CohereLogo} />
);

const embeddingModelOptions = ALL_EMBEDDING_MODELS.map((model: EmbeddingModel) => ({
  value: model.name,
  label: model.name,
  icon: model.provider === 'openai' ? OpenAIIcon : CohereIcon,
}));

const rerankerModelOptions = COHERE_RERANKER_MODELS.map((model: RerankerModel) => ({
  value: model.name,
  label: model.name,
  icon: CohereIcon,
}));

/**
 * Get all existing topics that match the given patterns (exact or regex).
 * Patterns with 'regex:' prefix are treated as regex patterns, others as exact matches.
 */
const getMatchedTopics = (patterns: string[], availableTopics: string[]): string[] => {
  const matchedTopics = new Set<string>();

  for (const pattern of patterns) {
    if (isRegexPattern(pattern)) {
      // Regex pattern - strip prefix and find all matching topics
      const regexPattern = stripRegexPrefix(pattern);
      try {
        const regex = new RegExp(regexPattern);
        for (const topic of availableTopics) {
          if (regex.test(topic)) {
            matchedTopics.add(topic);
          }
        }
      } catch {
        // Invalid regex, skip
      }
    } else if (availableTopics.includes(pattern)) {
      // Exact topic name - check if it exists
      matchedTopics.add(pattern);
    }
  }

  return Array.from(matchedTopics).sort();
};

export type KnowledgeBaseTableRow = {
  id: string;
  displayName: string;
  description: string;
  inputTopics: string[];
  embeddingGenerator: { provider: string; model: string };
  rerankerModel: { provider: string; model: string };
  tags: Record<string, string>;
  retrievalApiUrl: string;
};

const getInputTopics = (kb: KnowledgeBase): string[] => kb.indexer?.inputTopics || [];

const getEmbeddingGeneratorDisplay = (kb: KnowledgeBase): { provider: string; model: string } => {
  if (!kb.embeddingGenerator) {
    return { provider: '', model: '' };
  }
  const provider = kb.embeddingGenerator.provider?.provider.case || '';
  const model = kb.embeddingGenerator.model || '';
  return { provider, model };
};

const getRerankerModelDisplay = (kb: KnowledgeBase): { provider: string; model: string } => {
  if (!kb.retriever?.reranker?.enabled) {
    return { provider: '', model: '' };
  }
  const provider = kb.retriever.reranker.provider?.provider.case || '';
  const model =
    kb.retriever.reranker.provider?.provider.case === 'cohere'
      ? kb.retriever.reranker.provider.provider.value.model
      : '';
  return { provider, model: model || '' };
};

const ProviderLogo = ({ provider, className }: { provider: string; className?: string }) => {
  switch (provider.toLowerCase()) {
    case 'openai':
      return <img alt="OpenAI" className={className} src={OpenAILogo} />;
    case 'cohere':
      return <img alt="Cohere" className={className} src={CohereLogo} />;
    default:
      return null;
  }
};

const ModelCell = ({ provider, model }: { provider: string; model: string }) => {
  if (model === '') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <ProviderLogo className="h-4 w-4 shrink-0" provider={provider} />
      <Text variant="default">{model}</Text>
    </div>
  );
};

const transformKnowledgeBase = (kb: KnowledgeBase): KnowledgeBaseTableRow => ({
  id: kb.id,
  displayName: kb.displayName,
  description: kb.description,
  inputTopics: getInputTopics(kb),
  embeddingGenerator: getEmbeddingGeneratorDisplay(kb),
  rerankerModel: getRerankerModelDisplay(kb),
  tags: kb.tags || {},
  retrievalApiUrl: kb.retrievalApiUrl,
});

type CreateColumnsOptions = {
  handleDelete: (knowledgeBaseId: string) => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
  isDeletingKnowledgeBase: boolean;
  availableTopics: string[];
};

export const createColumns = (options: CreateColumnsOptions): ColumnDef<KnowledgeBaseTableRow>[] => {
  const { handleDelete, navigate, isDeletingKnowledgeBase, availableTopics } = options;
  return [
    {
      accessorKey: 'displayName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const displayName = row.getValue('displayName') as string;
        return (
          <Text className="wrap-break-word font-medium" variant="default">
            {displayName}
          </Text>
        );
      },
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => {
        const description = row.getValue('description') as string;
        return (
          <Text className="wrap-break-word" variant="default">
            {description || ''}
          </Text>
        );
      },
    },
    {
      accessorKey: 'inputTopics',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Input Topics" />,
      cell: ({ row }) => {
        const patterns = row.getValue('inputTopics') as string[];
        if (patterns.length === 0) {
          return <Text variant="muted">-</Text>;
        }

        // Get all existing topics that match the patterns
        const matchedTopics = getMatchedTopics(patterns, availableTopics);

        if (matchedTopics.length === 0) {
          return <Text variant="muted">-</Text>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {matchedTopics.map((topic) => (
              <button
                className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 text-xs transition-colors hover:bg-gray-200 hover:text-gray-900"
                key={topic}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/topics/${encodeURIComponent(topic)}`);
                }}
                type="button"
              >
                {topic}
              </button>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'embeddingGenerator',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Embedding Generator" />,
      cell: ({ row }) => {
        const value = row.getValue('embeddingGenerator') as { provider: string; model: string };
        return <ModelCell model={value.model} provider={value.provider} />;
      },
      filterFn: (row, id, value) => {
        const embeddingGenerator = row.getValue(id) as { provider: string; model: string };
        if (!embeddingGenerator.model) {
          return false;
        }
        return value.includes(embeddingGenerator.model);
      },
    },
    {
      accessorKey: 'rerankerModel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reranker Model" />,
      cell: ({ row }) => {
        const value = row.getValue('rerankerModel') as { provider: string; model: string };
        return <ModelCell model={value.model} provider={value.provider} />;
      },
      filterFn: (row, id, value) => {
        const rerankerModel = row.getValue(id) as { provider: string; model: string };
        if (!rerankerModel.model) {
          return false;
        }
        return value.includes(rerankerModel.model);
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const knowledgeBase = row.original;
        return (
          <KnowledgeBaseActionsCell
            isDeletingKnowledgeBase={isDeletingKnowledgeBase}
            knowledgeBase={knowledgeBase}
            onDelete={handleDelete}
          />
        );
      },
    },
  ];
};

function KnowledgeBaseDataTableToolbar({ table }: { table: TanstackTable<KnowledgeBaseTableRow> }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 w-[200px]"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            table.getColumn('displayName')?.setFilterValue(event.target.value)
          }
          placeholder="Filter knowledge bases..."
          value={(table.getColumn('displayName')?.getFilterValue() as string) ?? ''}
        />
        {table.getColumn('embeddingGenerator') && (
          <DataTableFacetedFilter
            column={table.getColumn('embeddingGenerator')}
            options={embeddingModelOptions}
            title="Embedding Model"
          />
        )}
        {table.getColumn('rerankerModel') && (
          <DataTableFacetedFilter
            column={table.getColumn('rerankerModel')}
            options={rerankerModelOptions}
            title="Reranker Model"
          />
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

  // Fetch all available topics to match against knowledge base patterns
  const { data: topicsData } = useListTopicsQuery(
    undefined,
    { enabled: Features.pipelinesApi },
    { hideInternalTopics: true }
  );

  const availableTopics = useMemo(
    () => (topicsData?.topics || []).map((topic) => topic.name).filter((name) => !name.startsWith('__redpanda')),
    [topicsData]
  );

  const knowledgeBases = React.useMemo(
    () => knowledgeBasesData?.knowledgeBases?.map(transformKnowledgeBase) || [],
    [knowledgeBasesData]
  );

  const { mutateAsync: deleteKnowledgeBase, isPending: isDeletingKnowledgeBase } = useDeleteKnowledgeBaseMutation();

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

  const handleDelete = useCallback(
    async (knowledgeBaseId: string) => {
      try {
        await deleteKnowledgeBase({ id: knowledgeBaseId });

        toast.success('Knowledge base deleted successfully');
      } catch (deleteError) {
        const connectError = ConnectError.from(deleteError);
        toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'delete', entity: 'knowledge base' }));
      }
    },
    [deleteKnowledgeBase]
  );

  const handleRowClick = (knowledgeBaseId: string, event: React.MouseEvent) => {
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
    navigate(`/knowledgebases/${encodeURIComponent(knowledgeBaseId)}`);
  };

  const columns = React.useMemo(
    () =>
      createColumns({
        handleDelete,
        navigate,
        isDeletingKnowledgeBase,
        availableTopics,
      }),
    [handleDelete, navigate, isDeletingKnowledgeBase, availableTopics]
  );

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
