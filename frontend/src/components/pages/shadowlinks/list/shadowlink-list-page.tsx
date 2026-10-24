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
import { Button } from 'components/redpanda-ui/components/button';
import { type DataTableColumnDef, useDataTable } from 'components/redpanda-ui/components/data-table';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Plus, RefreshCw } from 'lucide-react';
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
  ShadowLinkNoPermissionState,
  ShadowLinkUnavailableState,
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
  table: ReturnType<typeof useDataTable<ListShadowLinksResponse_ShadowLink>>;
  columns: DataTableColumnDef<ListShadowLinksResponse_ShadowLink>[];
  handleRowClick: (name: string, event: React.MouseEvent) => void;
}) => {
  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={columns.length}>
          <div className="flex items-center justify-center gap-2">
            <Spinner />
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
            <TableCell key={cell.id}>{<table.FlexRender cell={cell} />}</TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
};

export const createColumns: DataTableColumnDef<ListShadowLinksResponse_ShadowLink>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <div className="text-body font-medium">{row.getValue('name')}</div>,
  },
  {
    id: 'sourceCluster',
    accessorFn: (row) => row.bootstrapServers.join(',') || 'N/A',
    header: 'Source cluster',
    cell: ({ row }) => (
      <div className="font-mono text-body-sm text-muted-foreground">
        {row.original.bootstrapServers.join(',') || 'N/A'}
      </div>
    ),
  },
  {
    id: 'status',
    accessorFn: (row) => row.state,
    header: 'Status',
    cell: ({ row }) => <div className="text-body"> {getShadowLinkStateLabel(row.original?.state)} </div>,
  },
];

const useShadowLinksPageTitle = () => {
  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Shadow Links', linkTo: '' }];
    uiState.pageTitle = 'Shadow Links';
  }, []);
};

type ShadowLinksQueryError = ReturnType<typeof useListShadowLinksQuery>['error'];

// Show toast on error (except for feature-disabled or unavailable admin API errors)
const useShadowLinksErrorToast = (error: ShadowLinksQueryError) => {
  useEffect(() => {
    if (
      error &&
      error.code !== Code.FailedPrecondition &&
      error.code !== Code.Unavailable &&
      error.code !== Code.PermissionDenied
    ) {
      toast.error('Failed to load shadowlinks', {
        description: error.message,
      });
    }
  }, [error]);
};

// Empty state when no shadowlinks exist
const ShadowLinkCreateEmptyState = () => {
  const navigate = useNavigate();

  if (isEmbedded()) {
    return (
      <ShadowLinkEmptyStateCloud
        onCreateClick={() => {
          window.location.href = `${getBasePath()}/shadowlinks/create`;
        }}
      />
    );
  }
  return <ShadowLinkEmptyState onCreateClick={() => navigate({ to: '/shadowlinks/create' })} />;
};

type ShadowLinkListFallbackOptions = {
  error: ShadowLinksQueryError;
  isEmpty: boolean;
  onRetry: () => void;
};

/** The state shown in place of the list, or `null` when there are shadow links to list. */
const getShadowLinkListFallback = ({ error, isEmpty, onRetry }: ShadowLinkListFallbackOptions) => {
  // Admin API unavailable
  if (error?.code === Code.Unavailable) {
    return <ShadowLinkUnavailableState />;
  }
  if (error?.code === Code.PermissionDenied) {
    return <ShadowLinkNoPermissionState />;
  }
  if (error?.code === Code.FailedPrecondition && error.message.includes('Cluster link feature is disabled')) {
    return <ShadowLinkFeatureDisabledState />;
  }
  // Error state for other errors
  if (error) {
    return <ShadowLinkErrorState errorMessage={error.message} onRetry={onRetry} />;
  }
  return isEmpty ? <ShadowLinkCreateEmptyState /> : null;
};

type ShadowLinkListToolbarProps = {
  isLoading: boolean;
  hasShadowLink: boolean;
  onRefresh: () => void;
};

const ShadowLinkListToolbar = ({ isLoading, hasShadowLink, onRefresh }: ShadowLinkListToolbarProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label="Refresh shadow links"
        data-testid="refresh-shadowlinks-button"
        isLoading={isLoading}
        onClick={onRefresh}
        size="sm"
        variant="outline"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>

      <Tooltip delayDuration={0}>
        <TooltipTrigger
          render={
            <span className="inline-block">
              <Button disabled={hasShadowLink} onClick={() => navigate({ to: '/shadowlinks/create' })} size="sm">
                <Plus className="h-4 w-4" />
                Create shadow link
              </Button>
            </span>
          }
        />
        {Boolean(hasShadowLink) && (
          <TooltipContent>
            <p>Only one shadowlink can be created at this time</p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
};

export const ShadowLinkListPage = () => {
  const navigate = useNavigate();

  // React Query hooks
  const { data: shadowLinksData, isLoading, error, refetch } = useListShadowLinksQuery({});

  // Get shadowlinks array from response
  const shadowLinks = React.useMemo(() => shadowLinksData?.shadowLinks || [], [shadowLinksData]);

  useShadowLinksPageTitle();
  useShadowLinksErrorToast(error);

  const table = useDataTable({
    data: shadowLinks,
    columns: createColumns,
  });

  const fallback = getShadowLinkListFallback({
    error,
    isEmpty: !isLoading && shadowLinks.length === 0,
    onRetry: () => refetch(),
  });

  if (fallback) {
    return <div className="my-2 flex justify-center gap-2">{fallback}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          Manage shadow links to replicate topics from source clusters for disaster recovery and high availability.
        </div>

        {/* Only one shadow link is allowed, so creating another is disabled once one exists */}
        <ShadowLinkListToolbar
          hasShadowLink={shadowLinks.length > 0}
          isLoading={isLoading}
          onRefresh={() => refetch()}
        />
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>{<table.FlexRender header={header} />}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <ShadowLinkTableRows
            columns={createColumns}
            handleRowClick={(shadowLinkName) => navigate({ to: `/shadowlinks/${shadowLinkName}` })}
            isLoading={isLoading}
            table={table}
          />
        </TableBody>
      </Table>
    </div>
  );
};
