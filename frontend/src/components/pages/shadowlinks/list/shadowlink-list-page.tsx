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
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { type DataTableColumnDef, useDataTable } from 'components/redpanda-ui/components/data-table';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { useShadowBoxGuard } from 'components/shadow-box/use-shadow-box-guard';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import { Plus, RefreshCw } from 'lucide-react';
import type { ListShadowLinksResponse_ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import React, { useEffect } from 'react';
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { useShadowBoxStore } from 'stores/shadow-box-store';

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
import { hasBoxActivity } from '../../../shadow-box/shadow-box-model';
import { ShadowBoxSourcePanel } from '../../../shadow-box/shadow-box-source-panel';
import { getShadowLinkStateLabel } from '../model';
import { isShadowLinkingDisabledError } from '../shadowlink-helpers';

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
  const boxedReason = useShadowBoxGuard().reasonFor('createShadowLink');

  if (isEmbedded()) {
    return (
      <ShadowLinkEmptyStateCloud
        createDisabledReason={boxedReason}
        onCreateClick={() => {
          window.location.href = `${getBasePath()}/shadowlinks/create`;
        }}
      />
    );
  }
  return (
    <ShadowLinkEmptyState
      createDisabledReason={boxedReason}
      onCreateClick={() => navigate({ to: '/shadowlinks/create' })}
    />
  );
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
  if (isShadowLinkingDisabledError(error)) {
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
  const boxedReason = useShadowBoxGuard().reasonFor('createShadowLink');
  const createDisabledReason = hasShadowLink ? 'Only one shadowlink can be created at this time' : boxedReason;

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

      <DisabledReasonTooltip reason={createDisabledReason}>
        <Button
          disabled={Boolean(createDisabledReason)}
          onClick={() => navigate({ to: '/shadowlinks/create' })}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Create shadow link
        </Button>
      </DisabledReasonTooltip>
    </div>
  );
};

const ShadowLinksOnThisCluster = () => {
  const navigate = useNavigate();

  // React Query hooks
  const { data: shadowLinksData, isLoading, error, refetch } = useListShadowLinksQuery({});

  // Get shadowlinks array from response
  const shadowLinks = React.useMemo(() => shadowLinksData?.shadowLinks || [], [shadowLinksData]);

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

type ShadowLinksTab = 'links' | 'source';

/**
 * Open on the box only when this cluster is plainly acting as a source: it's boxed, or Cloud knows
 * links that read from it. Otherwise Links on this cluster, with its Create shadow link prompt.
 * Undefined until everything that decides it has loaded.
 */
const useDefaultTab = (): ShadowLinksTab | undefined => {
  const { data: shadowLinksData, isLoading } = useListShadowLinksQuery({});
  const { known, summary, isError } = useShadowBoxStatusQuery();
  const topology = useShadowBoxStore((state) => state.topology);

  if ((shadowLinksData?.shadowLinks.length ?? 0) > 0) {
    return 'links';
  }
  if (known && hasBoxActivity(summary.phase)) {
    return 'source';
  }
  if (topology && topology.readers.length > 0) {
    return 'source';
  }
  const settled = !isLoading && (known || isError) && !topology?.resolving;
  return settled ? 'links' : undefined;
};

export const ShadowLinkListPage = () => {
  const navigate = useNavigate();
  // Read from the location, not the route match: the page also renders outside its route in tests.
  const searchTab = (useLocation().search as { tab?: unknown }).tab;
  const requestedTab = searchTab === 'links' || searchTab === 'source' ? searchTab : undefined;
  const { available } = useShadowBoxStatusQuery();
  const defaultTab = useDefaultTab();
  const tab = requestedTab ?? defaultTab;

  useShadowLinksPageTitle();

  // Write the resolved default into the URL, so the banner and the host see which tab is showing.
  useEffect(() => {
    if (available && defaultTab && !requestedTab) {
      navigate({ to: '/shadowlinks', search: { tab: defaultTab }, replace: true });
    }
  }, [available, requestedTab, defaultTab, navigate]);

  if (!available) {
    return <ShadowLinksOnThisCluster />;
  }

  return (
    <Tabs
      onValueChange={(value) =>
        navigate({ to: '/shadowlinks', search: { tab: value as ShadowLinksTab }, replace: true })
      }
      value={tab ?? null}
    >
      <TabsList testId="shadowlinks-tabs" variant="underline">
        <TabsTrigger testId="shadowlinks-tab-links" value="links" variant="underline">
          Links on this cluster
        </TabsTrigger>
        <TabsTrigger testId="shadowlinks-tab-source" value="source" variant="underline">
          This cluster as a source
        </TabsTrigger>
      </TabsList>
      {tab ? (
        <TabsContents>
          <TabsContent className="pt-4" value="links">
            <ShadowLinksOnThisCluster />
          </TabsContent>
          <TabsContent className="pt-4" value="source">
            <ShadowBoxSourcePanel />
          </TabsContent>
        </TabsContents>
      ) : (
        <Skeleton className="mt-4 h-48" testId="shadowlinks-tab-loading" />
      )}
    </Tabs>
  );
};
