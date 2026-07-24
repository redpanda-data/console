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

import { Link } from '@tanstack/react-router';
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
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { ListLayout, ListLayoutFilters, ListLayoutPagination } from 'components/redpanda-ui/components/list-layout';
import { Search, UsersIcon, X } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLegacyListConsumerGroupsFullQuery } from 'react-query/api/consumer-group';

import type { ColumnMeta } from './column-meta';
import { appGlobal } from '../../../state/app-global';
import type { GroupDescription } from '../../../state/rest-interfaces';
import { setPageHeader } from '../../../state/ui-state';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { BrokerList } from '../../misc/broker-list';
import { ShortNum } from '../../misc/short-num';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
} from '../../redpanda-ui/components/data-table';
import { Input, InputEnd, InputStart } from '../../redpanda-ui/components/input';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Stat } from '../../redpanda-ui/components/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import {
  ConsumerGroupStateCell,
  consumerGroupStateFilterOptions,
} from '../../ui/consumer-group/consumer-group-state-cell';

const groupIdFilterFn = (row: Row<GroupDescription>, _columnId: string, filterValue: string) => {
  if (!filterValue) {
    return true;
  }
  const group = row.original;
  try {
    const re = new RegExp(filterValue, 'i');
    return re.test(group.groupId) || re.test(group.protocol);
  } catch {
    const term = filterValue.toLowerCase();
    return group.groupId.toLowerCase().includes(term) || group.protocol.toLowerCase().includes(term);
  }
};

const stateFilterFn = (row: Row<GroupDescription>, columnId: string, filterValues: string[]) => {
  if (!filterValues?.length) {
    return true;
  }
  return filterValues.includes(String(row.getValue(columnId)));
};

const GroupList: FC = () => {
  useLayoutEffect(() => {
    setPageHeader('Consumer Groups', [{ title: 'Consumer Groups', linkTo: '/groups' }]);
  }, []);

  const { data, isLoading, isError, error, refetch } = useLegacyListConsumerGroupsFullQuery();
  const consumerGroups = data.consumerGroups;

  useEffect(() => {
    appGlobal.onRefresh = () => {
      refetch();
    };
  }, [refetch]);

  const [searchValue, setSearchValue] = useQueryState('q', parseAsString.withDefault(''));
  const [stateFilter, setStateFilter] = useQueryState('state', parseAsArrayOf(parseAsString).withDefault([]));
  const [pageIndex, setPageIndex] = useQueryState('page', parseAsInteger.withDefault(0));
  const [pageSize, setPageSize] = useQueryState('pageSize', parseAsInteger.withDefault(DEFAULT_TABLE_PAGE_SIZE));
  const [sortId, setSortId] = useQueryState('sortId', parseAsString.withDefault(''));
  const [sortDesc, setSortDesc] = useQueryState('sortDesc', parseAsString.withDefault(''));

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc === 'true' }] : [];

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (next.length > 0) {
      setSortId(next[0].id);
      setSortDesc(next[0].desc ? 'true' : 'false');
    } else {
      setSortId('');
      setSortDesc('');
    }
    void setPageIndex(0);
  };

  const columnFilters: ColumnFiltersState = [
    ...(searchValue ? [{ id: 'groupId', value: searchValue }] : []),
    ...(stateFilter.length ? [{ id: 'state', value: stateFilter }] : []),
  ];

  const handleColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    const nameFilter = next.find((f) => f.id === 'groupId');
    const stateColumnFilter = next.find((f) => f.id === 'state');
    setSearchValue((nameFilter?.value as string) || null);
    setStateFilter((stateColumnFilter?.value as string[])?.length ? (stateColumnFilter?.value as string[]) : null);
    void setPageIndex(0);
  };

  const pagination: PaginationState = { pageIndex, pageSize };

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    void setPageIndex(next.pageIndex);
    void setPageSize(next.pageSize);
  };

  const statistics = useMemo(() => {
    const byState = new Map<string, number>();
    for (const group of consumerGroups) {
      byState.set(group.state, (byState.get(group.state) ?? 0) + 1);
    }
    return {
      total: consumerGroups.length,
      byState: Array.from(byState.entries()).map(([state, count]) => ({ state, count })),
    };
  }, [consumerGroups]);

  const columns: ColumnDef<GroupDescription>[] = [
    {
      accessorKey: 'state',
      header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
      filterFn: stateFilterFn,
      meta: { headWidth: 'md' as const },
      cell: ({ row: { original: group } }) => <ConsumerGroupStateCell state={group.state} />,
    },
    {
      accessorKey: 'groupId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
      filterFn: groupIdFilterFn,
      meta: { headWidth: 'full' as const },
      cell: ({ row: { original: group } }) => (
        <Link
          className="flex items-center gap-2 text-inherit no-underline hover:no-underline"
          data-testid={`consumer-group-link-${group.groupId}`}
          params={{ groupId: encodeURIComponent(group.groupId) }}
          search={{} as never}
          to="/groups/$groupId"
        >
          {group.protocolType !== 'consumer' && <Badge variant="secondary">Protocol: {group.protocolType}</Badge>}
          <span className="whitespace-break-spaces break-words">{group.groupId}</span>
        </Link>
      ),
    },
    {
      accessorKey: 'coordinatorId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Coordinator" />,
      enableColumnFilter: false,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original: group } }) => <BrokerList brokerIds={[group.coordinatorId]} />,
    },
    {
      accessorKey: 'protocol',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Protocol" />,
      enableColumnFilter: false,
      meta: { headWidth: 'sm' as const },
    },
    {
      id: 'members',
      accessorFn: (group) => group.members.length,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />,
      enableColumnFilter: false,
      meta: { headWidth: 'sm' as const },
    },
    {
      accessorKey: 'lagSum',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Offset Lag (Sum)" />,
      enableColumnFilter: false,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original: group } }) => <ShortNum value={group.lagSum} />,
    },
  ];

  const table = useReactTable({
    data: consumerGroups,
    columns,
    state: { sorting, pagination, columnFilters },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const groupIdFilter = (table.getColumn('groupId')?.getFilterValue() as string) ?? '';

  if (isError && error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load consumer groups</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const renderBody = () => {
    if (isLoading) {
      return [0, 1, 2, 3, 4].map((i) => (
        <TableRow key={i}>
          {columns.map((_col, colIdx) => (
            <TableCell key={colIdx}>
              <Skeleton variant="text" width="md" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    if (table.getRowModel().rows.length) {
      return table.getRowModel().rows.map((row) => (
        <TableRow key={row.id}>
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
            return (
              <TableCell align={meta?.align} key={cell.id} testId="data-table-cell">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            );
          })}
        </TableRow>
      ));
    }

    const isFiltered = columnFilters.length > 0;
    return (
      <TableRow>
        <TableCell colSpan={columns.length}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No consumer groups match your search' : 'No consumer groups yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try adjusting your search term or filters.'
                  : 'Consumer groups appear here once clients start consuming from your topics.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <ListLayout className="my-4" data-testid="consumer-groups-table">
      <div className="flex flex-wrap gap-8">
        <Stat label="Total groups" mono size="lg" value={statistics.total} />
        {statistics.byState.map(({ state, count }) => (
          <Stat key={state} label={state} mono size="lg" value={count} />
        ))}
      </div>

      <ListLayoutFilters>
        <Input
          containerClassName="w-full min-w-[140px] max-w-[300px] sm:w-[200px] lg:w-[250px]"
          onChange={(e) => table.getColumn('groupId')?.setFilterValue(e.target.value || undefined)}
          placeholder="Filter by group ID (regexp)..."
          size="sm"
          testId="search-field-input"
          value={groupIdFilter}
        >
          <InputStart>
            <Search className="size-4 text-muted-foreground" data-testid="search-field-search-icon" />
          </InputStart>
          {groupIdFilter !== '' && (
            <InputEnd className="pointer-events-auto">
              <Button
                aria-label="Clear group ID filter"
                data-testid="search-field-reset-icon"
                onClick={() => table.getColumn('groupId')?.setFilterValue(undefined)}
                size="icon-xs"
                variant="ghost"
              >
                <X />
              </Button>
            </InputEnd>
          )}
        </Input>
        <DataTableFacetedFilter
          column={table.getColumn('state')}
          options={consumerGroupStateFilterOptions}
          title="State"
        />
      </ListLayoutFilters>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                return (
                  <TableHead align={meta?.align} key={header.id} width={meta?.headWidth}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{renderBody()}</TableBody>
      </Table>

      <ListLayoutPagination className="[&>*]:w-full">
        <DataTablePagination table={table} />
      </ListLayoutPagination>
    </ListLayout>
  );
};

export default GroupList;
