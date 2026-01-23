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

import { Code } from '@connectrpc/connect';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import type { ListShadowLinksResponse_ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import React, { useEffect } from 'react';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import {
  ShadowLinkEmptyState,
  ShadowLinkEmptyStateCloud,
  ShadowLinkErrorState,
  ShadowLinkFeatureDisabledState,
} from './shadowlink-empty-state';
import { isEmbedded } from '../../../../config';
import { getBasePath } from '../../../../utils/env';
import { getShadowLinkStateLabel } from '../model';

// Extracted component for table body content
const ShadowLinkTableRows = ({
  isLoading,
  table,
  columns,
  handleRowClick,
}: {
  isLoading: boolean;
  table: ReturnType<typeof useReactTable<ListShadowLinksResponse_ShadowLink>>;
  columns: ColumnDef<ListShadowLinksResponse_ShadowLink>[];
  handleRowClick: (name: string, event: React.MouseEvent) => void;
}) => {
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

  return (
    <>
      {table.getRowModel().rows?.map((row) => (
        <TableRow
          className="cursor-pointer"
          data-testid={`shadowlink-row-${row.original.name}`}
          key={row.id}
          onClick={(event) => handleRowClick(row.original.name, event)}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
};

export const createColumns: ColumnDef<ListShadowLinksResponse_ShadowLink>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <Text className="font-medium">{row.getValue('name')}</Text>,
  },
  {
    id: 'sourceCluster',
    accessorFn: (row) => row.bootstrapServers.join(',') || 'N/A',
    header: 'Source cluster',
    cell: ({ row }) => (
      <Text className="font-mono text-muted-foreground" variant="small">
        {row.original.bootstrapServers.join(',') || 'N/A'}
      </Text>
    ),
  },
  {
    id: 'status',
    accessorFn: (row) => row.state,
    header: 'Status',
    cell: ({ row }) => <Text> {getShadowLinkStateLabel(row.original?.state)} </Text>,
  },
];

export const ShadowLinkListPage = () => {
  const navigate = useNavigate();

  // React Query hooks
  const { data: shadowLinksData, isLoading, error, refetch } = useListShadowLinksQuery({});

  // Get shadowlinks array from response
  const shadowLinks = React.useMemo(() => shadowLinksData?.shadowLinks || [], [shadowLinksData]);

  // Check if a shadowlink already exists (only one allowed)
  const hasShadowLink = shadowLinks.length > 0;

  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Shadow Links', linkTo: '' }];
    uiState.pageTitle = 'Shadow Links';
  }, []);

  // Show toast on error (except for feature-disabled errors)
  useEffect(() => {
    if (error && error.code !== Code.FailedPrecondition) {
      toast.error('Failed to load shadowlinks', {
        description: error.message,
      });
    }
  }, [error]);

  const handleRowClick = (shadowLinkName: string) => {
    navigate({ to: `/shadowlinks/${shadowLinkName}` });
  };

  const columns = React.useMemo(() => createColumns, []);

  const table = useReactTable({
    data: shadowLinks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Feature disabled state
  if (error?.code === Code.FailedPrecondition && error.message.includes('Cluster link feature is disabled')) {
    return (
      <div className="my-2 flex justify-center gap-2">
        <ShadowLinkFeatureDisabledState />
      </div>
    );
  }

  // Error state for other errors
  if (error) {
    return (
      <div className="my-2 flex justify-center gap-2">
        <ShadowLinkErrorState errorMessage={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  // Empty state when no shadowlinks exist
  if (!isLoading && shadowLinks.length === 0) {
    if (isEmbedded()) {
      return (
        <div className="my-2 flex justify-center gap-2">
          <ShadowLinkEmptyStateCloud
            onCreateClick={() => {
              window.location.href = `${getBasePath()}/shadowlinks/create`;
            }}
          />
        </div>
      );
    }
    return (
      <div className="my-2 flex justify-center gap-2">
        <ShadowLinkEmptyState onCreateClick={() => navigate({ to: '/shadowlinks/create' })} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Text variant="muted">
          Manage shadow links to replicate topics from source clusters for disaster recovery and high availability.
        </Text>

        <div className="flex items-center gap-2">
          <Button
            data-testid="refresh-shadowlinks-button"
            disabled={isLoading}
            onClick={() => refetch()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button
                  disabled={hasShadowLink}
                  onClick={() => navigate({ to: '/shadowlinks/create' })}
                  size="sm"
                  variant="secondary"
                >
                  <Plus className="h-4 w-4" />
                  Create shadow link
                </Button>
              </span>
            </TooltipTrigger>
            {Boolean(hasShadowLink) && (
              <TooltipContent>
                <p>Only one shadowlink can be created at this time</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="[&_tr:hover]:bg-transparent">
          <ShadowLinkTableRows columns={columns} handleRowClick={handleRowClick} isLoading={isLoading} table={table} />
        </TableBody>
      </Table>
    </div>
  );
};
