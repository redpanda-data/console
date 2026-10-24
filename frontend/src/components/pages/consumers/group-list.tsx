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
import type { ColumnFiltersState, PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { ListLayout, ListLayoutFilters, ListLayoutPagination } from 'components/redpanda-ui/components/list-layout';
import { Search, UsersIcon, X } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLegacyListConsumerGroupsFullQuery } from 'react-query/api/consumer-group';
import { columnMeta, readColumnMeta } from 'utils/data-table-column-meta';

import { appGlobal } from '../../../state/app-global';
import type { GroupDescription } from '../../../state/rest-interfaces';
import { setPageHeader } from '../../../state/ui-state';
import { BrokerList } from '../../misc/broker-list';
import { ShortNum } from '../../misc/short-num';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  type DataTableInstance,
  DataTablePagination,
  type DataTableRow,
  useDataTable,
} from '../../redpanda-ui/components/data-table';
import { Input, InputEnd, InputStart } from '../../redpanda-ui/components/input';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Stat } from '../../redpanda-ui/components/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import {
  ConsumerGroupStateCell,
  consumerGroupStateFilterOptions,
} from '../../ui/consumer-group/consumer-group-state-cell';
import { TonedIcon } from '../shared/toned-icon';

const groupIdFilterFn = (row: DataTableRow<GroupDescription>, _columnId: string, filterValue: string) => {
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

const DEFAULT_PAGE_SIZE = 10;

const stateFilterFn = (row: DataTableRow<GroupDescription>, columnId: string, filterValues: string[]) => {
  if (!filterValues?.length) {
    return true;
  }
  return filterValues.includes(String(row.getValue(columnId)));
};

const columns: DataTableColumnDef<GroupDescription>[] = [
  {
    accessorKey: 'state',
    header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
    filterFn: stateFilterFn,
    meta: columnMeta({ headWidth: 'md' as const }),
    cell: ({ row: { original: group } }) => <ConsumerGroupStateCell state={group.state} />,
  },
  {
    accessorKey: 'groupId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
    filterFn: groupIdFilterFn,
    meta: columnMeta({ headWidth: 'full' as const }),
    cell: ({ row: { original: group } }) => (
      <Link
        className="flex items-center"
        data-testid={`consumer-group-link-${group.groupId}`}
        params={{ groupId: encodeURIComponent(group.groupId) }}
        search={{} as never}
        to="/groups/$groupId"
      >
        {group.protocolType !== 'consumer' && (
          <Badge className="mr-2" tone="default" variant="subtle">
            Protocol: {group.protocolType}
          </Badge>
        )}
        <span className="wrap-break-word whitespace-break-spaces">{group.groupId}</span>
      </Link>
    ),
  },
  {
    accessorKey: 'coordinatorId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coordinator" />,
    enableColumnFilter: false,
    meta: columnMeta({ headWidth: 'sm' as const }),
    cell: ({ row: { original: group } }) => <BrokerList brokerIds={[group.coordinatorId]} />,
  },
  {
    accessorKey: 'protocol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Protocol" />,
    enableColumnFilter: false,
    meta: columnMeta({ headWidth: 'sm' as const }),
  },
  {
    id: 'members',
    accessorFn: (group) => group.members.length,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />,
    enableColumnFilter: false,
    meta: columnMeta({ headWidth: 'sm' as const }),
  },
  {
    accessorKey: 'lagSum',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Offset Lag (Sum)" />,
    enableColumnFilter: false,
    meta: columnMeta({ headWidth: 'sm' as const }),
    cell: ({ row: { original: group } }) => <ShortNum value={group.lagSum} />,
  },
];

/** Counts the groups in total and per state, in first-seen state order. */
const computeGroupStatistics = (consumerGroups: GroupDescription[]) => {
  const byState = new Map<string, number>();
  for (const group of consumerGroups) {
    byState.set(group.state, (byState.get(group.state) ?? 0) + 1);
  }
  return {
    total: consumerGroups.length,
    byState: Array.from(byState.entries()).map(([state, count]) => ({ state, count })),
  };
};

/** Sets the page header and points the global refresh button at this page's query. */
const useGroupListPageSetup = (refetch: () => unknown) => {
  useLayoutEffect(() => {
    setPageHeader('Consumer Groups', [{ title: 'Consumer Groups', linkTo: '/groups' }]);
  }, []);

  useEffect(() => {
    appGlobal.onRefresh = () => {
      refetch();
    };
  }, [refetch]);
};

const usePaginationSearchParams = () => {
  const [pageIndex, setPageIndex] = useQueryState('page', parseAsInteger.withDefault(0));
  const [pageSize, setPageSize] = useQueryState('pageSize', parseAsInteger.withDefault(DEFAULT_PAGE_SIZE));

  const pagination: PaginationState = { pageIndex, pageSize };

  const onPaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    void setPageIndex(next.pageIndex);
    void setPageSize(next.pageSize);
  };

  return { pagination, setPageIndex, onPaginationChange };
};

type SetPageIndex = ReturnType<typeof usePaginationSearchParams>['setPageIndex'];

const useSortingSearchParams = (setPageIndex: SetPageIndex) => {
  const [sortId, setSortId] = useQueryState('sortId', parseAsString.withDefault(''));
  const [sortDesc, setSortDesc] = useQueryState('sortDesc', parseAsString.withDefault(''));

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc === 'true' }] : [];

  const onSortingChange = (updater: Updater<SortingState>) => {
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

  return { sorting, onSortingChange };
};

const useColumnFiltersSearchParams = (setPageIndex: SetPageIndex) => {
  const [searchValue, setSearchValue] = useQueryState('q', parseAsString.withDefault(''));
  const [stateFilter, setStateFilter] = useQueryState('state', parseAsArrayOf(parseAsString).withDefault([]));

  const columnFilters: ColumnFiltersState = [
    ...(searchValue ? [{ id: 'groupId', value: searchValue }] : []),
    ...(stateFilter.length ? [{ id: 'state', value: stateFilter }] : []),
  ];

  const onColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    const nameFilter = next.find((f) => f.id === 'groupId');
    const stateColumnFilter = next.find((f) => f.id === 'state');
    setSearchValue((nameFilter?.value as string) || null);
    setStateFilter((stateColumnFilter?.value as string[])?.length ? (stateColumnFilter?.value as string[]) : null);
    void setPageIndex(0);
  };

  return { columnFilters, onColumnFiltersChange };
};

/** Table sorting, filters and pagination, kept in the URL search params. Any sort or filter change resets the page. */
const useGroupListTableParams = () => {
  const { pagination, setPageIndex, onPaginationChange } = usePaginationSearchParams();
  const { sorting, onSortingChange } = useSortingSearchParams(setPageIndex);
  const { columnFilters, onColumnFiltersChange } = useColumnFiltersSearchParams(setPageIndex);

  return {
    state: { sorting, pagination, columnFilters },
    onSortingChange,
    onPaginationChange,
    onColumnFiltersChange,
  };
};

const GroupListBody = ({
  isLoading,
  isFiltered,
  table,
}: {
  isLoading: boolean;
  isFiltered: boolean;
  table: DataTableInstance<GroupDescription>;
}) => {
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
          const meta = readColumnMeta(cell.column.columnDef.meta);
          return (
            <TableCell align={meta?.align} key={cell.id} testId="data-table-cell">
              {<table.FlexRender cell={cell} />}
            </TableCell>
          );
        })}
      </TableRow>
    ));
  }

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

const GroupList: FC = () => {
  const { data, isLoading, isError, error, refetch } = useLegacyListConsumerGroupsFullQuery();
  useGroupListPageSetup(refetch);
  const consumerGroups = data.consumerGroups;

  const tableParams = useGroupListTableParams();

  const statistics = useMemo(() => computeGroupStatistics(consumerGroups), [consumerGroups]);

  const table = useDataTable({
    data: consumerGroups,
    columns,
    enableHiding: false,
    enableRowSelection: false,
    ...tableParams,
    autoResetPageIndex: false,
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

  return (
    <ListLayout className="my-4 min-h-0" data-testid="consumer-groups-table">
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
            <TonedIcon className="size-4" data-testid="search-field-search-icon" icon={Search} tone="muted" />
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
                const meta = readColumnMeta(header.column.columnDef.meta);
                return (
                  <TableHead align={meta?.align} key={header.id} width={meta?.headWidth}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <GroupListBody isFiltered={tableParams.state.columnFilters.length > 0} isLoading={isLoading} table={table} />
        </TableBody>
      </Table>

      <ListLayoutPagination className="[&>*]:w-full">
        <DataTablePagination table={table} />
      </ListLayoutPagination>
    </ListLayout>
  );
};

export default GroupList;
