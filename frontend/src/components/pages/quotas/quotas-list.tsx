/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { ListLayoutPagination } from 'components/redpanda-ui/components/list-layout';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Link } from 'components/redpanda-ui/components/typography';
import { ArrowDown, ArrowUp, ChevronsUpDown, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import { docsLinks } from 'utils/docs-links';

import {
  clampPageIndex,
  getRate,
  isQuotaConfigured,
  mapEntityTypeToDisplay,
  type QuotaEntityDisplay,
  searchToSorting,
  sortingToSearch,
} from './quotas-list-utils';
import { useListQuotas } from '../../../hooks/use-list-quotas';
import { Quota_EntityType, Quota_ValueType } from '../../../protogen/redpanda/api/dataplane/v1/quota_pb';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import PageContent from '../../misc/page-content';

const DEFAULT_PAGE_SIZE = 50;

type QuotaRow = {
  entityType: QuotaEntityDisplay;
  entityName?: string | undefined;
  producerRate?: number;
  consumerRate?: number;
  controllerMutationRate?: number;
};

const renderSortIcon = (sorted: false | 'asc' | 'desc') => {
  if (sorted === 'desc') {
    return <ArrowDown />;
  }
  if (sorted === 'asc') {
    return <ArrowUp />;
  }
  return <ChevronsUpDown />;
};

/** Info icon that reveals a tooltip on hover, used next to column titles. */
const InfoTooltip = ({ children }: { children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <span className="inline-flex cursor-help text-muted-foreground">
          <InfoIcon className="size-3.5" />
        </span>
      }
    />
    <TooltipContent>{children}</TooltipContent>
  </Tooltip>
);

/** Sortable column header matching the look of DataTableColumnHeader, with an optional info tooltip. */
function SortableHeader({
  column,
  title,
  tooltip,
}: {
  column: Column<QuotaRow, unknown>;
  title: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button className="-ml-3 h-8" onClick={column.getToggleSortingHandler()} size="sm" variant="secondary-ghost">
        <span>{title}</span>
        {renderSortIcon(column.getIsSorted())}
      </Button>
      {tooltip ? <InfoTooltip>{tooltip}</InfoTooltip> : null}
    </div>
  );
}

/** Renders for a rate that has no quota set — an em-dash with a tooltip explaining there is no limit. */
const NOT_CONFIGURED_LABEL = 'No limit configured';

const NotConfigured = () => (
  <Tooltip>
    <TooltipTrigger
      render={
        <span className="cursor-help text-muted-foreground">
          {/* The em-dash is decorative; screen readers announce the sr-only label instead. */}
          <span aria-hidden="true">—</span>
          <span className="sr-only">{NOT_CONFIGURED_LABEL}</span>
        </span>
      }
    />
    <TooltipContent>{NOT_CONFIGURED_LABEL}</TooltipContent>
  </Tooltip>
);

const formatBytes = (value?: number) => (isQuotaConfigured(value) ? prettyBytes(value) : <NotConfigured />);
const formatRate = (value?: number) => (isQuotaConfigured(value) ? prettyNumber(value) : <NotConfigured />);

const columns: ColumnDef<QuotaRow>[] = [
  {
    accessorKey: 'entityType',
    size: 100,
    header: ({ column }) => <SortableHeader column={column} title="Type" />,
  },
  {
    accessorKey: 'entityName',
    size: 100,
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'producerRate',
    size: 100,
    header: ({ column }) => (
      <SortableHeader column={column} title="Producer Rate" tooltip="Limit throughput of produce requests" />
    ),
    cell: ({ row }) => formatBytes(row.original.producerRate),
  },
  {
    accessorKey: 'consumerRate',
    size: 100,
    header: ({ column }) => (
      <SortableHeader column={column} title="Consumer Rate" tooltip="Limit throughput of fetch requests" />
    ),
    cell: ({ row }) => formatBytes(row.original.consumerRate),
  },
  {
    accessorKey: 'controllerMutationRate',
    size: 100,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        title="Controller Mutation Rate"
        tooltip="Limit rate of topic mutation requests, including create, add, and delete partition, in number of partitions per second"
      />
    ),
    cell: ({ row }) => formatRate(row.original.controllerMutationRate),
  },
];

const QuotasList = () => {
  const navigate = useNavigate({ from: '/quotas' });
  const search = useSearch({ from: '/quotas' });
  const { data, error, isLoading } = useListQuotas();

  const quotasData = useMemo<QuotaRow[]>(() => {
    if (!data?.quotas) {
      return [];
    }

    return data.quotas.map((quota) => {
      const entityType = quota.entity?.entityType ?? Quota_EntityType.UNSPECIFIED;
      const entityName = quota.entity?.entityName;

      return {
        entityType: mapEntityTypeToDisplay(entityType),
        entityName: entityName || undefined,
        producerRate: getRate(quota.values, Quota_ValueType.PRODUCER_BYTE_RATE),
        consumerRate: getRate(quota.values, Quota_ValueType.CONSUMER_BYTE_RATE),
        controllerMutationRate: getRate(quota.values, Quota_ValueType.CONTROLLER_MUTATION_RATE),
      };
    });
  }, [data]);

  const pageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pagination: PaginationState = {
    // Clamp the requested page to what the data actually supports, so a stale or
    // bookmarked out-of-range `?page=` can't render a false empty state.
    pageIndex: clampPageIndex(search.page ?? 0, quotasData.length, pageSize),
    pageSize,
  };

  const sorting: SortingState = searchToSorting(search.sortField, search.sortDirection);

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    navigate({
      search: (prev) => ({ ...prev, page: next.pageIndex, pageSize: next.pageSize }),
      replace: true,
    });
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    navigate({
      search: (prev) => ({ ...prev, ...sortingToSearch(next) }),
      replace: true,
    });
  };

  const table = useReactTable({
    data: quotasData,
    columns,
    state: { pagination, sorting },
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  if (isLoading) {
    return (
      <PageContent>
        <Skeleton className="h-100 w-full" />
      </PageContent>
    );
  }

  if (error) {
    const isPermissionError = error.message.includes('permission') || error.message.includes('forbidden');

    if (isPermissionError) {
      return (
        <PageContent>
          <Empty>
            <EmptyHeader>
              <h1 className="text-heading-xl">403</h1>
              <EmptyTitle>Forbidden</EmptyTitle>
              <EmptyDescription>
                You are not allowed to view this page.
                <br />
                Contact the administrator if you think this is an error.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href={docsLinks.selfManaged.console} rel="noopener noreferrer" target="_blank">
                <Button variant="primary">Redpanda Console documentation for roles and permissions</Button>
              </Link>
            </EmptyContent>
          </Empty>
        </PageContent>
      );
    }

    return (
      <PageContent>
        <Alert icon={<TriangleAlertIcon />} variant="destructive">
          <AlertDescription>
            <div className="text-body">{error.message || 'Failed to load quotas'}</div>
          </AlertDescription>
        </Alert>
      </PageContent>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    // Single TooltipProvider hoisted to the page root so the per-cell tooltips
    // (column-header info icons, "no limit configured" em-dashes) share one
    // provider instead of mounting one per instance.
    <TooltipProvider>
      <PageContent>
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
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                  No quotas configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <ListLayoutPagination>
          <DataTablePagination table={table} />
        </ListLayoutPagination>
      </PageContent>
    </TooltipProvider>
  );
};

export default QuotasList;
