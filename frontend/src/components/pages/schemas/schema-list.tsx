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
import type { ColumnFiltersState, FilterFn, PaginationState, Updater } from '@tanstack/react-table';
import { ArchiveIcon, EditIcon, MoreHorizontalIcon, TrashIcon } from 'components/icons';
import { DescriptionWithHelp } from 'components/pages/security/shared/description-with-help';
import { Alert, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  type DataTableFeatures,
  DataTablePagination,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { InputStart } from 'components/redpanda-ui/components/input';
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
import { columnMeta, readColumnMeta } from 'utils/data-table-column-meta';
import { sortingParser } from 'utils/sorting-parser';

import { DeleteDialog, PermanentDeleteDialog } from './modals';
import { SchemaContextSelector } from './schema-context-selector';
import {
  ALL_CONTEXT_ID,
  DEFAULT_CONTEXT_ID,
  deriveContexts,
  isNamedContext,
  parseSubjectContext,
} from './schema-context-utils';
import { subjectsInContext, subjectsMatchingSearch } from './schema-list-filters';
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
import { TonedIcon } from '../shared/toned-icon';

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

const SCHEMA_TYPE_BADGE_TONE: Record<string, BadgeTone> = {
  AVRO: 'informative',
  PROTOBUF: 'brand',
  JSON: 'warning',
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
const multiSelectFilterFn: FilterFn<DataTableFeatures, EnrichedSubject> = (row, columnId, filterValue) => {
  const selected = filterValue as string[] | undefined;
  if (!selected?.length) {
    return true;
  }
  return selected.includes(String(row.getValue(columnId)));
};

type DeleteTarget = { kind: 'soft' | 'permanent'; name: string };

// The quick search and the soft-deleted toggle, both kept in the URL.
function useSchemaListSearch() {
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
  return { quickSearch, setQuickSearch, showSoftDeleted, setShowSoftDeleted };
}

// Registry-wide data for the list (subjects, contexts, global mode and
// compatibility); also owns the page header and the refresh action.
function useSchemaRegistryOverview() {
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const { data: schemaSubjects, isLoading, isError, refetch: refetchSchemas } = useListSchemasQuery();
  const { data: contexts } = useSchemaRegistryContextsQuery(schemaRegistryContextsSupported);
  const { data: schemaMode, refetch: refetchMode } = useSchemaModeQuery();
  const { data: schemaCompatibility, refetch: refetchCompatibility } = useSchemaCompatibilityQuery();

  const refreshData = useCallback(() => {
    refetchMode();
    refetchCompatibility();
    api.refreshSchemaTypes();
    refetchSchemas();
  }, [refetchSchemas, refetchMode, refetchCompatibility]);

  useEffect(() => {
    setPageHeader('Schema Registry', [{ title: 'Schema Registry', linkTo: '/schema-registry' }]);
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  return {
    schemaRegistryContextsSupported,
    schemaSubjects,
    contexts,
    isLoading,
    isError,
    schemaMode,
    schemaCompatibility,
  };
}

// The selected context (kept in the URL), the contexts to pick from, and the
// mode and compatibility to show for the selection.
function useSelectedSchemaContext({
  schemaRegistryContextsSupported,
  contexts,
  schemaSubjects,
  schemaMode,
  schemaCompatibility,
}: Pick<
  ReturnType<typeof useSchemaRegistryOverview>,
  'schemaRegistryContextsSupported' | 'contexts' | 'schemaSubjects' | 'schemaMode' | 'schemaCompatibility'
>) {
  const [selectedContext, setSelectedContext] = useQueryState('context', parseAsString.withDefault(DEFAULT_CONTEXT_ID));

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

  return {
    selectedContext,
    setSelectedContext,
    derivedContexts,
    displayMode,
    displayCompat,
    isAllContext: schemaRegistryContextsSupported && selectedContext === ALL_CONTEXT_ID,
  };
}

function useSchemaListPagination() {
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

  return { pagination, setPageIndex, handlePaginationChange };
}

// Faceted filter state lives in the URL, one param per column, so a filtered view
// survives a reload and can be shared — same as the search, context and page params.
function useSchemaListColumnFilters(setPageIndex: (pageIndex: number) => unknown) {
  const [typeFilter, setTypeFilter] = useQueryState('type', parseAsArrayOf(parseAsString).withDefault([]));
  const [compatibilityFilter, setCompatibilityFilter] = useQueryState(
    'compatibility',
    parseAsArrayOf(parseAsString).withDefault([])
  );

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

  return { columnFilters, handleColumnFiltersChange };
}

// Sorting, pagination and column filters for the subject table, all kept in the URL.
function useSchemaListTableState() {
  const [sorting, setSorting] = useQueryState('sort', sortingParser.withDefault([]));
  const { pagination, setPageIndex, handlePaginationChange } = useSchemaListPagination();
  const { columnFilters, handleColumnFiltersChange } = useSchemaListColumnFilters(setPageIndex);
  return {
    sorting,
    setSorting,
    pagination,
    setPageIndex,
    handlePaginationChange,
    columnFilters,
    handleColumnFiltersChange,
  };
}

// The subjects to list: the selected context, soft-deleted toggle and search
// applied, each enriched with its details so type and compatibility can be
// filtered list-wide.
function useVisibleSubjects({
  schemaSubjects,
  quickSearch,
  showSoftDeleted,
  schemaRegistryContextsSupported,
  selectedContext,
}: {
  schemaSubjects: SchemaRegistrySubject[] | undefined;
  quickSearch: string;
  showSoftDeleted: boolean;
  schemaRegistryContextsSupported: boolean;
  selectedContext: string;
}) {
  // Parse schema ID from search query
  const schemaIdSearch = useMemo(() => {
    const trimmedValue = quickSearch.trim();
    const searchAsNum = Number(trimmedValue);
    return trimmedValue.length && !Number.isNaN(searchAsNum) ? searchAsNum : null;
  }, [quickSearch]);

  const { data: schemaUsages, isLoading: isLoadingSchemaVersionMatches } = useSchemaUsagesByIdQuery(schemaIdSearch);

  const subjectNames = useMemo(() => (schemaSubjects ?? []).map((s) => s.name), [schemaSubjects]);
  const detailsByName = useSchemaDetailsByNameQuery(subjectNames);

  const filteredSubjects = useMemo(() => {
    const inContext = subjectsInContext(schemaSubjects ?? [], schemaRegistryContextsSupported, selectedContext);
    const visible = showSoftDeleted ? inContext : inContext.filter((x) => !x.isSoftDeleted);
    return subjectsMatchingSearch(visible, quickSearch, schemaUsages);
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

  return { enrichedSubjects, isLoadingSchemaVersionMatches };
}

function useSchemaListColumns(
  isAllContext: boolean,
  selectedContext: string,
  setDeleteTarget: (target: DeleteTarget) => void
) {
  return useMemo<DataTableColumnDef<EnrichedSubject>[]>(
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
            <div className="wrap-break-word whitespace-break-spaces">
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
                          <TonedIcon aria-hidden="true" height={16} icon={ArchiveIcon} tone="muted" width={16} />
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
                  <Badge size="sm" tone="default" variant="subtle">
                    {context === 'default' ? 'Default' : `.${context}`}
                  </Badge>
                );
              },
            } satisfies DataTableColumnDef<EnrichedSubject>,
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
          return (
            <Badge size="sm" tone={SCHEMA_TYPE_BADGE_TONE[subject.details.type] ?? 'default'} variant="subtle">
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
        meta: columnMeta({ align: 'right' as const }),
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
    [isAllContext, selectedContext, setDeleteTarget]
  );
}

function useSchemaListTable({
  enrichedSubjects,
  isAllContext,
  selectedContext,
  setDeleteTarget,
  tableState,
}: {
  enrichedSubjects: EnrichedSubject[];
  isAllContext: boolean;
  selectedContext: string;
  setDeleteTarget: (target: DeleteTarget) => void;
  tableState: ReturnType<typeof useSchemaListTableState>;
}) {
  const columns = useSchemaListColumns(isAllContext, selectedContext, setDeleteTarget);
  const table = useDataTable({
    data: enrichedSubjects,
    columns,
    enableHiding: false,
    enableRowSelection: false,
    state: { sorting: tableState.sorting, pagination: tableState.pagination, columnFilters: tableState.columnFilters },
    onSortingChange: tableState.setSorting,
    onPaginationChange: tableState.handlePaginationChange,
    onColumnFiltersChange: tableState.handleColumnFiltersChange,
    autoResetPageIndex: false,
  });
  return { table, columns };
}

function SchemaListTableBody({
  isLoading,
  table,
  columnCount,
}: {
  isLoading: boolean;
  table: ReturnType<typeof useSchemaListTable>['table'];
  columnCount: number;
}) {
  if (isLoading) {
    return [0, 1, 2, 3, 4].map((rowIdx) => (
      <TableRow key={rowIdx}>
        {Array.from({ length: columnCount }, (_col, colIdx) => (
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
          const content = <table.FlexRender cell={cell} />;
          return (
            <TableCell align={meta?.align} key={cell.id}>
              {content}
            </TableCell>
          );
        })}
      </TableRow>
    ));
  }

  return (
    <TableRow>
      <TableCell align="center" colSpan={columnCount}>
        No schemas found.
      </TableCell>
    </TableRow>
  );
}

// Confirmation dialogs for soft- and permanently deleting the subject picked in the table.
function SubjectDeleteDialogs({ deleteTarget, onClose }: { deleteTarget: DeleteTarget | null; onClose: () => void }) {
  const deleteSchemaMutation = useDeleteSchemaSubjectMutation();

  return (
    <>
      <DeleteDialog
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: false },
            {
              onSuccess: () => toast.success('Subject soft-deleted'),
              onError: (err) => toast.error('Failed to soft-delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open={deleteTarget?.kind === 'soft'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
      <PermanentDeleteDialog
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: true },
            {
              onSuccess: () => toast.success('Subject permanently deleted'),
              onError: (err) => toast.error('Failed to permanently delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open={deleteTarget?.kind === 'permanent'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
    </>
  );
}

const SchemaList: FC = () => {
  const { quickSearch, setQuickSearch, showSoftDeleted, setShowSoftDeleted } = useSchemaListSearch();
  const {
    schemaRegistryContextsSupported,
    schemaSubjects,
    contexts,
    isLoading,
    isError,
    schemaMode,
    schemaCompatibility,
  } = useSchemaRegistryOverview();
  const { selectedContext, setSelectedContext, derivedContexts, displayMode, displayCompat, isAllContext } =
    useSelectedSchemaContext({
      schemaRegistryContextsSupported,
      contexts,
      schemaSubjects,
      schemaMode,
      schemaCompatibility,
    });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const tableState = useSchemaListTableState();
  const { enrichedSubjects, isLoadingSchemaVersionMatches } = useVisibleSubjects({
    schemaSubjects,
    quickSearch,
    showSoftDeleted,
    schemaRegistryContextsSupported,
    selectedContext,
  });
  const { table, columns } = useSchemaListTable({
    enrichedSubjects,
    isAllContext,
    selectedContext,
    setDeleteTarget,
    tableState,
  });

  if (schemaMode === null) {
    return <SchemaNotConfiguredPage />;
  }

  return (
    <PageContent key="b">
      {/* Statistics Bar — the context selector lives here, not in the table filters,
          because switching context changes the whole page (mode, compatibility,
          create-schema default), not just the rows shown. */}
      <StatGroup
        className="w-fit"
        columns={schemaRegistryContextsSupported ? 3 : 2}
        gap="lg"
        testId="schema-list-stats"
      >
        {schemaRegistryContextsSupported && (
          <Stat
            label="Context"
            testId="schema-list-context-stat"
            value={
              <SchemaContextSelector
                contexts={derivedContexts}
                onContextChange={(ctx) => {
                  setSelectedContext(ctx);
                  tableState.setPageIndex(0);
                }}
                selectedContext={selectedContext}
              />
            }
          />
        )}
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
                      variant="ghost"
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
                      variant="ghost"
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
        <ListLayout className="my-4 min-h-0" data-testid="schema-list-table">
          <div className="text-body text-muted-foreground sm:text-body-lg">
            <DescriptionWithHelp
              short="Subjects and versions for the schemas that validate your topic records."
              testId="schema-search-help"
              title="Schema search help"
              titleTestId="schema-help-title"
            >
              <section aria-labelledby="filtering-heading" className="space-y-3">
                <h3 className="text-heading-sm text-foreground" id="filtering-heading">
                  Filtering schemas
                </h3>
                <p className="text-body text-muted-foreground">
                  There are two ways to filter schemas, and they work a little differently.
                </p>
              </section>

              <div className="space-y-4 pl-4">
                <section aria-labelledby="schema-id-heading" className="space-y-2">
                  <h3 className="text-heading-sm text-foreground" id="schema-id-heading">
                    Schema ID
                  </h3>
                  <p className="text-body text-muted-foreground">
                    If a number matches a schema ID, the results include all subjects referencing that schema.
                  </p>
                </section>

                <section aria-labelledby="subject-name-heading" className="space-y-2">
                  <h3 className="text-heading-sm text-foreground" id="subject-name-heading">
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
                      onClick={() => {
                        // Carry the selected context into the create page URL so the
                        // form pre-fills it and survives a reload. "All" has no single
                        // context to pre-fill, so it uses the plain create page.
                        if (schemaRegistryContextsSupported && selectedContext !== ALL_CONTEXT_ID) {
                          const contextName = selectedContext === DEFAULT_CONTEXT_ID ? 'default' : selectedContext;
                          appGlobal.historyPush(`/schema-registry/contexts/${encodeURIComponent(contextName)}/create`);
                        } else {
                          appGlobal.historyPush('/schema-registry/create');
                        }
                      }}
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
            <div data-testid="schema-list-search-field">
              <ListLayoutSearchInput
                aria-label="Filter by subject name or schema ID"
                onChange={(e) => {
                  setQuickSearch(e.target.value);
                  tableState.setPageIndex(0);
                }}
                placeholder="Filter by subject name or schema ID..."
                value={quickSearch ?? ''}
              >
                <InputStart>
                  <TonedIcon aria-hidden="true" className="size-4" icon={SearchIcon} tone="muted" />
                </InputStart>
              </ListLayoutSearchInput>
            </div>
            {isLoadingSchemaVersionMatches && <Spinner className="size-5" />}
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
            <label className="flex cursor-pointer items-center gap-2 text-body">
              <Checkbox
                checked={showSoftDeleted}
                onCheckedChange={(checked) => {
                  setShowSoftDeleted(checked === true);
                  tableState.setPageIndex(0);
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
                    const meta = readColumnMeta(header.column.columnDef.meta);
                    return (
                      <TableHead align={meta?.align} key={header.id}>
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              <SchemaListTableBody columnCount={columns.length} isLoading={isLoading} table={table} />
            </TableBody>
          </Table>
          <DataTablePagination table={table} />
        </ListLayout>
      )}
      <SubjectDeleteDialogs deleteTarget={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </PageContent>
  );
};

export default SchemaList;
