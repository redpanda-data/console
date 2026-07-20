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
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { ArchiveIcon, EditIcon, MoreHorizontalIcon, TrashIcon } from 'components/icons';
import { DescriptionWithHelp } from 'components/pages/security/shared/description-with-help';
import { Alert, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
} from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { ListLayout, ListLayoutFilters, ListLayoutSearchInput } from 'components/redpanda-ui/components/list-layout';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Stat, StatGroup } from 'components/redpanda-ui/components/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { SearchIcon } from 'lucide-react';
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { sortingParser } from 'utils/sorting-parser';

import { DeleteDialog, PermanentDeleteDialog } from './modals';
import { SchemaContextSelector } from './schema-context-selector';
import {
  ALL_CONTEXT_ID,
  CONTEXT_PREFIX_RE,
  DEFAULT_CONTEXT_ID,
  deriveContexts,
  isNamedContext,
  parseSubjectContext,
} from './schema-context-utils';
import { SchemaNotConfiguredPage } from './schema-not-configured';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import {
  useDeleteSchemaSubjectMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsByNameQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
  useSchemaUsagesByIdQuery,
} from '../../../react-query/api/schema-registry';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import {
  SchemaRegistryCompatibilityModes,
  type SchemaRegistrySubject,
  type SchemaRegistrySubjectDetails,
  SchemaType,
} from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { setPageHeader } from '../../../state/ui-state';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/page-content';

const RequestErrors: FC<{ requestErrors?: string[] }> = ({ requestErrors }) => {
  if (!requestErrors || requestErrors.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {requestErrors.map((errorMessage) => (
        <Alert className="mt-4" key={errorMessage} variant="destructive">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      ))}
    </div>
  );
};

const SCHEMA_TYPE_BADGE_VARIANT: Record<string, string> = {
  AVRO: 'info-inverted',
  PROTOBUF: 'accent-inverted',
  JSON: 'warning-inverted',
};

const SCHEMA_TYPE_FILTER_OPTIONS = [
  { label: 'Avro', value: SchemaType.AVRO },
  { label: 'Protobuf', value: SchemaType.PROTOBUF },
  { label: 'JSON', value: SchemaType.JSON },
];

const SCHEMA_COMPATIBILITY_FILTER_OPTIONS = Object.values(SchemaRegistryCompatibilityModes).map((mode) => ({
  label: mode,
  value: mode,
}));

// Subject rows enriched with per-subject details so type/compatibility can be filtered list-wide.
type EnrichedSubject = SchemaRegistrySubject & {
  details?: SchemaRegistrySubjectDetails;
  detailsLoading: boolean;
};

// Faceted filters set an array of selected values; match rows whose column value is one of them.
const multiSelectFilterFn: FilterFn<EnrichedSubject> = (row, columnId, filterValue) => {
  const selected = filterValue as string[] | undefined;
  if (!selected?.length) {
    return true;
  }
  return selected.includes(String(row.getValue(columnId)));
};

const SchemaList: FC = () => {
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  const [showSoftDeleted, setShowSoftDeleted] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.schemaList.showSoftDeleted = val;
      },
      getDefaultValue: () => uiSettings.schemaList.showSoftDeleted,
    },
    'showSoftDeleted',
    parseAsBoolean
  );

  const [selectedContext, setSelectedContext] = useQueryState('context', parseAsString.withDefault(DEFAULT_CONTEXT_ID));
  const { data: schemaSubjects, isLoading, isError, refetch: refetchSchemas } = useListSchemasQuery();
  const { data: contexts } = useSchemaRegistryContextsQuery(schemaRegistryContextsSupported);
  const { data: schemaMode, refetch: refetchMode } = useSchemaModeQuery();
  const { data: schemaCompatibility, refetch: refetchCompatibility } = useSchemaCompatibilityQuery();
  const deleteSchemaMutation = useDeleteSchemaSubjectMutation();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'soft' | 'permanent'; name: string } | null>(null);
  const [sorting, setSorting] = useQueryState('sort', sortingParser.withDefault([]));
  const [typeFilter, setTypeFilter] = useQueryState('type', parseAsArrayOf(parseAsString).withDefault([]));
  const [compatibilityFilter, setCompatibilityFilter] = useQueryState(
    'compatibility',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [pageIndex, setPageIndex] = useQueryState('page', parseAsInteger.withDefault(0));
  const [pageSize, setPageSize] = useQueryState('pageSize', parseAsInteger.withDefault(10));

  const pagination = useMemo<PaginationState>(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    [pagination, setPageIndex, setPageSize]
  );

  // Faceted filter state lives in the URL, one param per column, so a filtered view
  // survives a reload and can be shared — same as the search, context and page params.
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (typeFilter.length > 0) {
      filters.push({ id: 'type', value: typeFilter });
    }
    if (compatibilityFilter.length > 0) {
      filters.push({ id: 'compatibility', value: compatibilityFilter });
    }
    return filters;
  }, [typeFilter, compatibilityFilter]);

  const handleColumnFiltersChange = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      const valuesFor = (id: string) => (next.find((filter) => filter.id === id)?.value as string[] | undefined) ?? [];
      setTypeFilter(valuesFor('type'));
      setCompatibilityFilter(valuesFor('compatibility'));
      setPageIndex(0);
    },
    [columnFilters, setTypeFilter, setCompatibilityFilter, setPageIndex]
  );

  // Parse schema ID from search query
  const schemaIdSearch = useMemo(() => {
    const trimmedValue = quickSearch.trim();
    const searchAsNum = Number(trimmedValue);
    return trimmedValue.length && !Number.isNaN(searchAsNum) ? searchAsNum : null;
  }, [quickSearch]);

  const { data: schemaUsages, isLoading: isLoadingSchemaVersionMatches } = useSchemaUsagesByIdQuery(schemaIdSearch);

  const subjectNames = useMemo(() => (schemaSubjects ?? []).map((s) => s.name), [schemaSubjects]);
  const detailsByName = useSchemaDetailsByNameQuery(subjectNames);

  const refreshData = useCallback(() => {
    refetchMode();
    refetchCompatibility();
    api.refreshSchemaTypes();
    refetchSchemas();
  }, [refetchSchemas, refetchMode, refetchCompatibility]);

  const derivedContexts = useMemo(
    () => (schemaRegistryContextsSupported ? deriveContexts(contexts ?? [], schemaSubjects ?? []) : []),
    [contexts, schemaSubjects, schemaRegistryContextsSupported]
  );

  // Reset to default if the selected context no longer exists (e.g. deleted server-side).
  // Wait until both contexts and subjects have loaded to avoid resetting during partial data.
  const contextsLoaded = contexts !== undefined;
  const subjectsLoaded = schemaSubjects !== undefined;
  useEffect(() => {
    if (
      contextsLoaded &&
      subjectsLoaded &&
      derivedContexts.length > 0 &&
      !derivedContexts.some((c) => c.id === selectedContext)
    ) {
      setSelectedContext(DEFAULT_CONTEXT_ID);
    }
  }, [derivedContexts, selectedContext, setSelectedContext, contextsLoaded, subjectsLoaded]);

  // Use context-specific mode/compat when a named context is selected
  const { displayMode, displayCompat } = useMemo(() => {
    const ctx = derivedContexts.find((c) => c.id === selectedContext);
    const useContextLevel = ctx && isNamedContext(selectedContext) && schemaRegistryContextsSupported;
    return {
      displayMode: useContextLevel ? ctx.mode : schemaMode,
      displayCompat: useContextLevel ? ctx.compatibility : schemaCompatibility,
    };
  }, [derivedContexts, selectedContext, schemaRegistryContextsSupported, schemaMode, schemaCompatibility]);

  useEffect(() => {
    setPageHeader('Schema Registry', [{ title: 'Schema Registry', linkTo: '/schema-registry' }]);
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  const isAllContext = schemaRegistryContextsSupported && selectedContext === ALL_CONTEXT_ID;

  const filteredSubjects = useMemo(() => {
    let subjects = schemaSubjects ?? [];

    // Filter by context
    if (schemaRegistryContextsSupported && selectedContext !== ALL_CONTEXT_ID) {
      if (selectedContext === DEFAULT_CONTEXT_ID) {
        subjects = subjects.filter((s) => !CONTEXT_PREFIX_RE.test(s.name));
      } else {
        const prefix = `:${selectedContext}:`;
        subjects = subjects.filter((s) => s.name.startsWith(prefix));
      }
    }

    // Filter by soft-deleted status
    if (!showSoftDeleted) {
      subjects = subjects.filter((x) => !x.isSoftDeleted);
    }

    // Filter by search query
    const searchQuery = quickSearch;
    if (searchQuery) {
      // Find by schema ID
      const filterAsNumber = Number(searchQuery.trim());
      if (Number.isNaN(filterAsNumber)) {
        // Find by regex or string matching
        try {
          const quickSearchRegExp = new RegExp(searchQuery, 'i');
          subjects = subjects.filter((subject) => Boolean(subject.name.match(quickSearchRegExp)));
        } catch (_e) {
          const searchLower = searchQuery.toLowerCase();
          subjects = subjects.filter((subject) => subject.name.toLowerCase().includes(searchLower));
        }
      } else {
        const matchingSubjectNames = new Set(schemaUsages?.map((s) => s.subject) ?? []);
        subjects = subjects.filter((subject) => matchingSubjectNames.has(subject.name));
      }
    }

    return subjects;
  }, [schemaSubjects, quickSearch, showSoftDeleted, schemaUsages, schemaRegistryContextsSupported, selectedContext]);

  const enrichedSubjects = useMemo<EnrichedSubject[]>(
    () =>
      filteredSubjects.map((subject) => ({
        ...subject,
        details: detailsByName[subject.name]?.data,
        detailsLoading: detailsByName[subject.name]?.isLoading ?? false,
      })),
    [filteredSubjects, detailsByName]
  );

  const columns = useMemo<ColumnDef<EnrichedSubject>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({
          row: {
            original: { name, isSoftDeleted },
          },
        }) => {
          const parsed = parseSubjectContext(name);
          return (
            <div className="whitespace-break-spaces break-words">
              <div className="flex items-center gap-2">
                <Link
                  data-testid="schema-registry-table-name"
                  params={{ subjectName: encodeURIComponentPercents(name) }}
                  search={{ version: 'latest' }}
                  to="/schema-registry/subjects/$subjectName"
                >
                  {isAllContext && parsed.context !== 'default' && (
                    <span className="text-muted-foreground">:.{parsed.context}:</span>
                  )}
                  {isAllContext || isNamedContext(selectedContext) ? parsed.displayName : name}
                </Link>
                {isSoftDeleted && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span aria-label="Soft-deleted" data-testid="schema-list-soft-deleted-icon">
                          <ArchiveIcon aria-hidden="true" className="text-muted-foreground" height={16} width={16} />
                        </span>
                      }
                    />
                    <TooltipContent>
                      This subject has been soft-deleted. It can be restored or permanently deleted.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        },
      },
      ...(isAllContext
        ? [
            {
              header: 'Context',
              id: 'context',
              enableSorting: false,
              cell: ({ row }: { row: { original: EnrichedSubject } }) => {
                const { context } = parseSubjectContext(row.original.name);
                return (
                  <Badge size="sm" variant="neutral-inverted">
                    {context === 'default' ? 'Default' : `.${context}`}
                  </Badge>
                );
              },
            } satisfies ColumnDef<EnrichedSubject>,
          ]
        : []),
      {
        id: 'type',
        accessorFn: (subject) => subject.details?.type ?? '',
        header: 'Type',
        enableSorting: false,
        filterFn: multiSelectFilterFn,
        cell: ({ row: { original: subject } }) => {
          if (subject.detailsLoading) {
            return <Skeleton variant="text" />;
          }
          if (!subject.details) {
            return <span className="text-muted-foreground">—</span>;
          }
          const variant = SCHEMA_TYPE_BADGE_VARIANT[subject.details.type] ?? 'neutral-inverted';
          return (
            <Badge size="sm" variant={variant as 'info-inverted'}>
              {subject.details.type}
            </Badge>
          );
        },
      },
      {
        id: 'compatibility',
        accessorFn: (subject) => subject.details?.compatibility ?? '',
        header: 'Compatibility',
        enableSorting: false,
        filterFn: multiSelectFilterFn,
        cell: ({ row: { original: subject } }) => {
          if (subject.detailsLoading) {
            return <Skeleton variant="text" />;
          }
          if (!subject.details) {
            return <span className="text-muted-foreground">—</span>;
          }
          return <>{subject.details.compatibility}</>;
        },
      },
      {
        id: 'mode',
        header: 'Mode',
        enableSorting: false,
        cell: ({ row: { original: subject } }) => {
          if (subject.detailsLoading) {
            return <Skeleton variant="text" />;
          }
          if (!subject.details) {
            return <span className="text-muted-foreground">—</span>;
          }
          return <>{subject.details.mode}</>;
        },
      },
      {
        id: 'latestVersion',
        header: 'Latest Version',
        enableSorting: false,
        cell: ({ row: { original: subject } }) => {
          if (subject.detailsLoading) {
            return <Skeleton variant="text" />;
          }
          if (!subject.details || subject.details.latestActiveVersion < 0) {
            return <span className="text-muted-foreground">None</span>;
          }
          return <>{subject.details.latestActiveVersion}</>;
        },
      },
      {
        header: '',
        id: 'actions',
        enableSorting: false,
        meta: { align: 'right' as const },
        cell: ({ row: { original: subject } }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Schema actions"
                  data-testid={`schema-list-actions-trigger-${subject.name}`}
                  size="icon-sm"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem
                data-testid={`schema-list-delete-btn-${subject.name}`}
                disabled={api.userData?.canDeleteSchemas === false || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDeleteTarget({ kind: subject.isSoftDeleted ? 'permanent' : 'soft', name: subject.name });
                }}
                variant="destructive"
              >
                <TrashIcon />
                {subject.isSoftDeleted ? 'Delete permanently' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [isAllContext, selectedContext]
  );

  const table = useReactTable({
    data: enrichedSubjects,
    columns,
    state: { sorting, pagination, columnFilters },
    onSortingChange: setSorting,
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

  const renderBody = () => {
    if (isLoading) {
      return [0, 1, 2, 3, 4].map((rowIdx) => (
        <TableRow key={rowIdx}>
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
        <TableRow className={row.original.isSoftDeleted ? 'text-muted-foreground' : ''} key={row.id}>
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta as { align?: 'right' } | undefined;
            return (
              <TableCell align={meta?.align} key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            );
          })}
        </TableRow>
      ));
    }

    return (
      <TableRow>
        <TableCell className="text-center text-muted-foreground" colSpan={columns.length}>
          No schemas found.
        </TableCell>
      </TableRow>
    );
  };

  if (schemaMode === null) {
    return <SchemaNotConfiguredPage />;
  }

  return (
    <PageContent key="b">
      {/* Statistics Bar */}
      <StatGroup className="w-fit" columns={2} gap="lg" testId="schema-list-stats">
        <Stat
          label={isNamedContext(selectedContext) && schemaRegistryContextsSupported ? 'Context mode' : 'Mode'}
          testId="schema-list-mode-stat"
          value={
            <div className="flex items-center gap-1.5">
              {displayMode ?? <Skeleton variant="text" width="sm" />}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Edit mode"
                      data-testid="schema-list-edit-mode-btn"
                      disabled={api.userData?.canManageSchemaRegistry === false}
                      onClick={() =>
                        isNamedContext(selectedContext) && schemaRegistryContextsSupported
                          ? appGlobal.historyPush(
                              `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-mode`
                            )
                          : appGlobal.historyPush('/schema-registry/edit-mode')
                      }
                      size="icon-xs"
                      variant="secondary-ghost"
                    >
                      <EditIcon />
                    </Button>
                  }
                />
                {api.userData?.canManageSchemaRegistry === false && (
                  <TooltipContent side="top">You don't have the 'canManageSchemaRegistry' permission</TooltipContent>
                )}
              </Tooltip>
            </div>
          }
        />
        <Stat
          label={
            isNamedContext(selectedContext) && schemaRegistryContextsSupported
              ? 'Context compatibility'
              : 'Compatibility'
          }
          testId="schema-list-compatibility-stat"
          value={
            <div className="flex items-center gap-1.5">
              {displayCompat ?? <Skeleton variant="text" width="sm" />}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Edit compatibility"
                      data-testid="schema-list-edit-compatibility-btn"
                      disabled={api.userData?.canManageSchemaRegistry === false}
                      onClick={() =>
                        isNamedContext(selectedContext) && schemaRegistryContextsSupported
                          ? appGlobal.historyPush(
                              `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-compatibility`
                            )
                          : appGlobal.historyPush('/schema-registry/edit-compatibility')
                      }
                      size="icon-xs"
                      variant="secondary-ghost"
                    >
                      <EditIcon />
                    </Button>
                  }
                />
                {api.userData?.canManageSchemaRegistry === false && (
                  <TooltipContent side="top">You don't have the 'canManageSchemaRegistry' permission</TooltipContent>
                )}
              </Tooltip>
            </div>
          }
        />
      </StatGroup>
      <RequestErrors />
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error loading schemas</AlertTitle>
        </Alert>
      ) : (
        <ListLayout className="my-4" data-testid="schema-list-table">
          <div className="text-muted-foreground text-sm sm:text-base">
            <DescriptionWithHelp
              short="Subjects and versions for the schemas that validate your topic records."
              testId="schema-search-help"
              title="Schema search help"
              titleTestId="schema-help-title"
            >
              <section aria-labelledby="filtering-heading" className="space-y-3">
                <h3 className="text-foreground text-heading-sm" id="filtering-heading">
                  Filtering schemas
                </h3>
                <p className="text-body text-muted-foreground">
                  There are two ways to filter schemas, and they work a little differently.
                </p>
              </section>

              <div className="space-y-4 pl-4">
                <section aria-labelledby="schema-id-heading" className="space-y-2">
                  <h3 className="text-foreground text-heading-sm" id="schema-id-heading">
                    Schema ID
                  </h3>
                  <p className="text-body text-muted-foreground">
                    If a number matches a schema ID, the results include all subjects referencing that schema.
                  </p>
                </section>

                <section aria-labelledby="subject-name-heading" className="space-y-2">
                  <h3 className="text-foreground text-heading-sm" id="subject-name-heading">
                    Subject name
                  </h3>
                  <p className="text-body text-muted-foreground">
                    To search subject names, enter that specific name or a regex.
                  </p>
                </section>
              </div>
            </DescriptionWithHelp>
          </div>
          <ListLayoutFilters
            actions={
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      data-testid="schema-list-create-btn"
                      disabled={api.userData?.canCreateSchemas === false}
                      onClick={() =>
                        isNamedContext(selectedContext) && schemaRegistryContextsSupported
                          ? appGlobal.historyPush(
                              `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/create`
                            )
                          : appGlobal.historyPush('/schema-registry/create')
                      }
                      variant="primary"
                    >
                      Create new schema
                    </Button>
                  }
                />
                {api.userData?.canCreateSchemas === false && (
                  <TooltipContent side="top">You don't have the 'canCreateSchemas' permission</TooltipContent>
                )}
              </Tooltip>
            }
          >
            <div className="relative" data-testid="schema-list-search-field">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <ListLayoutSearchInput
                aria-label="Filter by subject name or schema ID"
                className="pl-9"
                onChange={(e) => {
                  setQuickSearch(e.target.value);
                  setPageIndex(0);
                }}
                placeholder="Filter by subject name or schema ID..."
                value={quickSearch ?? ''}
              />
            </div>
            {isLoadingSchemaVersionMatches && <Spinner className="size-5" />}
            {schemaRegistryContextsSupported && (
              <SchemaContextSelector
                contexts={derivedContexts}
                onContextChange={(ctx) => {
                  setSelectedContext(ctx);
                  setPageIndex(0);
                }}
                selectedContext={selectedContext}
              />
            )}
            <DataTableFacetedFilter
              column={table.getColumn('type')}
              options={SCHEMA_TYPE_FILTER_OPTIONS}
              testId="schema-list-type-filter"
              title="Type"
            />
            <DataTableFacetedFilter
              column={table.getColumn('compatibility')}
              options={SCHEMA_COMPATIBILITY_FILTER_OPTIONS}
              testId="schema-list-compatibility-filter"
              title="Compatibility"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={showSoftDeleted}
                onCheckedChange={(checked) => {
                  setShowSoftDeleted(checked === true);
                  setPageIndex(0);
                }}
                testId="schema-list-show-soft-deleted-checkbox"
              />
              Show soft-deleted
            </label>
          </ListLayoutFilters>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as { align?: 'right' } | undefined;
                    return (
                      <TableHead align={meta?.align} key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>{renderBody()}</TableBody>
          </Table>
          <DataTablePagination table={table} />
        </ListLayout>
      )}
      <DeleteDialog
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: false },
            {
              onSuccess: () => toast.success('Subject soft-deleted'),
              onError: (err) => toast.error('Failed to soft-delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget?.kind === 'soft'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
      <PermanentDeleteDialog
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: true },
            {
              onSuccess: () => toast.success('Subject permanently deleted'),
              onError: (err) => toast.error('Failed to permanently delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget?.kind === 'permanent'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
    </PageContent>
  );
};

export default SchemaList;
