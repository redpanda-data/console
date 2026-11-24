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
import type { ShadowLinkTopology } from 'components/cluster-fence/shadow-link-topology';
import { useClusterFenceGuard } from 'components/cluster-fence/use-cluster-fence-guard';
import { Button } from 'components/redpanda-ui/components/button';
import { type DataTableColumnDef, useDataTable } from 'components/redpanda-ui/components/data-table';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Plus, RefreshCw } from 'lucide-react';
import type { ListShadowLinksResponse_ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import React, { useEffect } from 'react';
import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

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
import { hasFenceActivity } from '../../../cluster-fence/cluster-fence-model';
import { ClusterFenceSourcePanel } from '../../../cluster-fence/cluster-fence-source-panel';
import { getShadowLinkStateLabel } from '../model';
import { isShadowLinkingDisabledError } from '../shadowlink-helpers';

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

const getShadowLinkListFallback = ({ error, isEmpty, onRetry }: ShadowLinkListFallbackOptions) => {
  if (error?.code === Code.Unavailable) {
    return <ShadowLinkUnavailableState />;
  }
  if (error?.code === Code.PermissionDenied) {
    return <ShadowLinkNoPermissionState />;
  }
  if (isShadowLinkingDisabledError(error)) {
    return <ShadowLinkFeatureDisabledState />;
  }
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
  const fenceReason = useClusterFenceGuard().reasonFor('createShadowLink');
  const fencedReason = hasShadowLink ? undefined : fenceReason;

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
              <Button
                disabled={hasShadowLink || Boolean(fencedReason)}
                onClick={() => navigate({ to: '/shadowlinks/create' })}
                size="sm"
              >
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
        {fencedReason ? <TooltipContent>{fencedReason}</TooltipContent> : null}
      </Tooltip>
    </div>
  );
};

const ShadowLinksOnThisCluster = () => {
  const navigate = useNavigate();

  const { data: shadowLinksData, isLoading, error, refetch } = useListShadowLinksQuery({});

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

const isFirstLoad = ({ isLoading, isFetched }: ReturnType<typeof useListShadowLinksQuery>) => isLoading && !isFetched;

const opensOnFence = (
  { known, summary, unreadable, blocking, isLoading, isError }: ReturnType<typeof useClusterFenceStatusQuery>,
  topology: ShadowLinkTopology | null
) => {
  const fenceInUse = (known && hasFenceActivity(summary.phase)) || unreadable || blocking;
  if (fenceInUse || (topology?.readers.length ?? 0) > 0) {
    return true;
  }
  const statusRead = !isLoading && (known || isError);
  if (!statusRead || topology?.resolving) {
    return;
  }
  return !topology && known;
};

const useDefaultTab: () => ShadowLinksTab | undefined = () => {
  const fenceFirst = opensOnFence(
    useClusterFenceStatusQuery(),
    useClusterFenceStore((state) => state.topology)
  );
  const ownLinks = useListShadowLinksQuery({});
  if ((ownLinks.data?.shadowLinks.length ?? 0) > 0) {
    return 'links';
  }
  if (fenceFirst === undefined || (fenceFirst && isFirstLoad(ownLinks))) {
    return;
  }
  return fenceFirst ? 'source' : 'links';
};

const useRequestedTab: () => ShadowLinksTab | undefined = () => {
  const searchTab = (useLocation().search as { tab?: unknown }).tab;
  return searchTab === 'links' || searchTab === 'source' ? searchTab : undefined;
};

const useDefaultTabInUrl = (
  fenceTab: boolean,
  requestedTab: ShadowLinksTab | undefined,
  defaultTab: ShadowLinksTab | undefined
) => {
  const navigate = useNavigate();
  const onThisPage = useLocation().pathname === '/shadowlinks';
  useEffect(() => {
    if (onThisPage && fenceTab && defaultTab && !requestedTab) {
      navigate({ to: '/shadowlinks', search: { tab: defaultTab }, replace: true }).catch((error: unknown) => {
        toast.error('Failed to open the shadow links tab', { description: String(error) });
      });
    }
  }, [onThisPage, fenceTab, requestedTab, defaultTab, navigate]);
};

const useShadowLinksTab = () => {
  const requestedTab = useRequestedTab();
  const fenceTab = useClusterFenceStatusQuery().available;
  const defaultTab = useDefaultTab();
  useDefaultTabInUrl(fenceTab, requestedTab, defaultTab);
  return { fenceTab, tab: requestedTab ?? defaultTab };
};

/**
 * The first load may suspend the page, but subsequent failed loads must not remount the list or they can retry forever. Record the resolved tab in the URL only while on this route; the router keeps it mounted during navigation.
 *
 * Default to the fence when the cluster is a relevant source and has no links of its own. A self-hosted cluster may be a source even without shadow linking enabled. Provide the fence tab before any link exists, and explain why fencing is unavailable on a shadow-only cluster.
 */
export const ShadowLinkListPage = () => {
  const navigate = useNavigate();
  const { fenceTab, tab } = useShadowLinksTab();
  useShadowLinksPageTitle();

  if (!fenceTab) {
    return <ShadowLinksOnThisCluster />;
  }
  if (!tab) {
    return <Skeleton className="h-48" testId="shadowlinks-tab-loading" />;
  }

  return (
    <Tabs
      onValueChange={(value) => {
        navigate({ to: '/shadowlinks', search: { tab: value as ShadowLinksTab }, replace: true }).catch(
          (error: unknown) => {
            toast.error('Failed to open the shadow links tab', { description: String(error) });
          }
        );
      }}
      value={tab}
    >
      <TabsList testId="shadowlinks-tabs" variant="underline">
        <TabsTrigger testId="shadowlinks-tab-links" value="links" variant="underline">
          Links on this cluster
        </TabsTrigger>
        <TabsTrigger testId="shadowlinks-tab-source" value="source" variant="underline">
          Cluster fence
        </TabsTrigger>
      </TabsList>
      <TabsContents className="mt-4">
        <TabsContent value="links">
          <ShadowLinksOnThisCluster />
        </TabsContent>
        <TabsContent value="source">
          <ClusterFenceSourcePanel />
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
};
