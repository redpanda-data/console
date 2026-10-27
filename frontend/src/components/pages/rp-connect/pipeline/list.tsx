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

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { Link as TanStackRouterLink, useNavigate } from '@tanstack/react-router';
import type { FilterFn, SortingState } from '@tanstack/react-table';
import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { getUserTagEntries } from 'components/constants';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Button } from 'components/redpanda-ui/components/button';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  type DataTableFeatures,
  DataTablePagination,
  isRowActivationClick,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, List, ListItem } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
import { FadePresence } from 'components/ui/fade-presence';
import {
  PIPELINE_STATE_LABELS,
  PIPELINE_STATE_SORT_PRIORITY,
  PIPELINE_STATE_STATUS_VARIANT,
  STARTABLE_STATES,
  STOPPABLE_STATES,
} from 'components/ui/pipeline/constants';
import { AlertCircle, Box, MoreHorizontal, Search, X } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  type ComponentType,
  type MouseEvent,
  memo,
  type ReactElement,
  type ReactNode,
  type SVGProps,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useInvalidatePipelineQueries,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { appGlobal } from 'state/app-global';
import {
  autosaveTargetKey,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { useResetRpcnWizardStore } from 'state/rpcn-wizard-store';
import { docsLinks } from 'utils/docs-links';
import { isModifiedClick } from 'utils/mouse-events';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { parseConfigComponentsCached } from './config-components-cache';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DRAFT_BADGE_TOOLTIP, isDraft, relativeAgeLabel, timestampToMillis } from './draft-copy';
import {
  aggregateConnectors,
  countPipelinesPerTab,
  matchesNameOrId,
  PIPELINE_STATE_TABS,
  type PipelineStateTabId,
  pipelineListEmptyText,
  stateFilterValues,
} from './list-utils';
import { useStartDraftConfirm } from './start-draft-dialog';
import { TabKafkaConnect } from '../../connect/overview';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { cpuToTasks } from '../tasks';

type TagPair = { key: string; value: string };

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  inputs: string[];
  outputs: string[];
  tags: TagPair[];
  isDraft: boolean;
  /** Epoch ms of the last edit. */
  editedAt: number | null;
  /** Empty on a deployed row: only a draft opens the start confirmation, which names these. */
  configYaml: string;
  computeUnits: number;
};

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => {
  const { inputs, outputs } = parseConfigComponentsCached(apiPipeline.configYaml);
  const tags = getUserTagEntries(apiPipeline.tags);
  const draft = isDraft(apiPipeline);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    inputs,
    outputs,
    tags,
    isDraft: draft,
    editedAt: timestampToMillis(apiPipeline.updateTime),
    configYaml: draft ? apiPipeline.configYaml : '',
    computeUnits: draft ? (cpuToTasks(apiPipeline.resources?.cpuShares) ?? 0) : 0,
  };
};

const EmptyCell = () => <span className="text-muted-foreground">—</span>;

// One string per tag pair, so `arrIncludesSome` and the facet counts agree on the value.
const tagFilterValue = (tag: TagPair) => `${tag.key}:${tag.value}`;

const ConnectorBadges = ({ names }: { names: string[] }) => {
  const connectors = useMemo(() => aggregateConnectors(names), [names]);
  if (connectors.length === 0) {
    return <EmptyCell />;
  }
  return (
    <BadgeGroup
      maxVisible={2}
      renderOverflowContent={(overflow) => (
        <List>
          {connectors.slice(-overflow.length).map((c) => (
            <ListItem key={c.name}>{c.count > 1 ? `${c.name} ×${c.count}` : c.name}</ListItem>
          ))}
        </List>
      )}
    >
      {connectors.map((c) => (
        <Badge key={c.name} tone="default" variant="subtle">
          <ConnectorLogo className="size-3.5" fallback={Box} name={c.name as ComponentName} />
          {/* One text node: as siblings, name and multiplier sit a pixel off each other's baseline. */}
          <span>
            {c.name}
            {c.count > 1 ? <span className="ml-1 text-muted-foreground">×{c.count}</span> : null}
          </span>
        </Badge>
      ))}
    </BadgeGroup>
  );
};

// autoRemove as the built-in array filters do: an empty selection means "no filter", not "match nothing".
const stateInFilterFn: FilterFn<DataTableFeatures, Pipeline> = (row, columnId, filterValue: string[]) =>
  filterValue.includes(row.getValue<string>(columnId));
stateInFilterFn.autoRemove = (value) => !value || (Array.isArray(value) && value.length === 0);

const sortPriority = (row: Pipeline): number => PIPELINE_STATE_SORT_PRIORITY[row.state] ?? Number.MAX_SAFE_INTEGER;

const PAGE_SIZE = 20;

// Module scope: the query hook memoizes on request identity. Asked for unconditionally because the
// flag gates making drafts, not seeing the ones already made — turning it back off must not strand a
// draft that still counts against the cluster's quota with no row to delete it from.
const LIST_WITH_DRAFTS = { filter: { includeDrafts: true } } as const;

// One table for every tab, so the tabs need an explicit `aria-controls` target — otherwise a screen
// reader announces "tab, 1 of 4" with nowhere to move into.
const STATUS_PANEL_ID = 'pipeline-status-panel';
const statusTabId = (tabId: PipelineStateTabId) => `pipeline-status-tab-${tabId}`;

// The status lines below the table unmount as they animate, and a live region only announces changes
// made while already mounted — so these stay mounted for the reader.
const ListStatusAnnouncements = ({
  isLoadingMorePages,
  listErrorMessage,
}: {
  isLoadingMorePages: boolean;
  listErrorMessage: string | null;
}) => (
  <>
    <div aria-live="polite" className="sr-only">
      {isLoadingMorePages ? 'Loading more pipelines' : ''}
    </div>
    <div className="sr-only" role="alert">
      {listErrorMessage ?? ''}
    </div>
  </>
);

const SKELETON_COLUMNS: { head: string; cell: ReactElement }[] = [
  {
    head: 'w-24',
    cell: (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  {
    head: 'w-20',
    cell: (
      <div className="flex gap-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  { head: 'w-16', cell: <Skeleton className="h-6 w-16" /> },
  { head: 'w-8', cell: <Skeleton className="h-8 w-8" /> },
];

const SKELETON_ROW_COUNT = 5;

const PipelineListSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-20" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          {SKELETON_COLUMNS.map((column, columnIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
            <TableHead key={columnIndex}>
              <Skeleton className={cn('h-4', column.head)} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
          <TableRow key={rowIndex}>
            {SKELETON_COLUMNS.map((column, columnIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
              <TableCell key={columnIndex}>{column.cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {/* Stands in for the pagination footer: without it, the first real paint lifts the table. */}
    <div className="flex items-center justify-end gap-6 px-2">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  </div>
);

type DeleteMutate = ReturnType<typeof useDeletePipelineMutation>['mutate'];
type StartMutate = ReturnType<typeof useStartPipelineMutation>['mutate'];
type StopMutate = ReturnType<typeof useStopPipelineMutation>['mutate'];

const startPipeline = (startMutation: StartMutate, id: string) => {
  const startRequest = create(StartPipelineRequestSchema, {
    request: { id },
  });
  startMutation(startRequest, {
    onSuccess: () => {
      toast.success('Pipeline starting');
    },
    onError: (err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'start',
          entity: 'pipeline',
        })
      );
    },
  });
};

const stopPipeline = (stopMutation: StopMutate, id: string) => {
  const stopRequest = create(StopPipelineRequestSchema, {
    request: { id },
  });
  stopMutation(stopRequest, {
    onSuccess: () => {
      toast.success('Pipeline stopping');
    },
    onError: (err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'stop',
          entity: 'pipeline',
        })
      );
    },
  });
};

const deletePipeline = (deleteMutation: DeleteMutate, id: string, isDraftRow: boolean) => {
  const deleteRequest = create(DeletePipelineRequestSchema, {
    request: { id },
  });

  deleteMutation(deleteRequest, {
    onSuccess: () => {
      rpcnEditorAutosave.clear(autosaveTargetKey(id));
      toast.success(isDraftRow ? 'Draft deleted' : 'Pipeline deleted');
    },
    onError: (err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'delete',
          entity: 'pipeline',
        })
      );
    },
  });
};

type ActionsCellProps = {
  pipeline: Pipeline;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: DeleteMutate;
  startMutation: StartMutate;
  stopMutation: StopMutate;
  isDeletingPipeline: boolean;
};

const ActionsCell = memo(
  ({ pipeline, navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline }: ActionsCellProps) => {
    const isDraftRow = pipeline.isDraft;
    const canStart = !isDraftRow && (STARTABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const canStop = !isDraftRow && (STOPPABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const isStarting = pipeline.state === Pipeline_State.STARTING;
    const isStopping = pipeline.state === Pipeline_State.STOPPING;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { requestStart, isStartingDraft, confirmDialog } = useStartDraftConfirm({
      id: pipeline.id,
      configYaml: pipeline.configYaml,
      computeUnits: pipeline.computeUnits,
    });
    // The dialog says so when this browser also holds unsaved edits for the draft.
    const hasUnsavedChanges = useRpcnEditorAutosaveStore(
      (s) => isDraftRow && selectAutosaveEntry(s.entries, autosaveTargetKey(pipeline.id)) !== null
    );

    return (
      <div className="flex min-w-[68px] justify-end" data-actions-column>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="size-8" size="icon" variant="ghost">
                <MoreHorizontal />
                <span className="sr-only">Open menu</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: '/rp-connect/$pipelineId/edit',
                  params: { pipelineId: encodeURIComponent(pipeline.id) },
                })
              }
            >
              {isDraftRow ? 'Continue editing' : 'Edit'}
            </DropdownMenuItem>
            {isDraftRow ? (
              <DropdownMenuItem disabled={isStartingDraft} onClick={requestStart}>
                Start
              </DropdownMenuItem>
            ) : null}
            {isStarting ? (
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline.id)}>Retry start</DropdownMenuItem>
            ) : null}
            {isStopping ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Retry stop</DropdownMenuItem>
            ) : null}
            {canStart ? (
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline.id)}>Start</DropdownMenuItem>
            ) : null}
            {canStop ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Stop</DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DeleteResourceMenuItem
              isDeleting={isDeletingPipeline}
              onSelect={() => setIsDeleteDialogOpen(true)}
              text={isDraftRow ? 'Delete draft' : undefined}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {isDraftRow ? confirmDialog : null}
        {isDraftRow ? (
          <DeleteDraftDialog
            draftName={pipeline.name}
            hasUnsavedChanges={hasUnsavedChanges}
            isDeleting={isDeletingPipeline}
            onConfirm={() => deletePipeline(deleteMutation, pipeline.id, isDraftRow)}
            onOpenChange={setIsDeleteDialogOpen}
            open={isDeleteDialogOpen}
          />
        ) : (
          <DeleteResourceAlertDialog
            isDeleting={isDeletingPipeline}
            onDelete={(id) => deletePipeline(deleteMutation, id, isDraftRow)}
            onOpenChange={setIsDeleteDialogOpen}
            open={isDeleteDialogOpen}
            resourceId={pipeline.id}
            resourceName={pipeline.name}
            resourceType="Pipeline"
          />
        )}
      </div>
    );
  }
);

ActionsCell.displayName = 'ActionsCell';

type CreateColumnsOptions = {
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: DeleteMutate;
  startMutation: StartMutate;
  stopMutation: StopMutate;
  isDeletingPipeline: boolean;
};

type LogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Facet options are rebuilt on every drain page and poll tick, so each option's icon is the connector's
// own logo component: a stable type, where a fresh one per render would remount every logo in the open
// popover. The facet list sizes it.
const connectorOption = (name: string) => ({
  value: name,
  label: name,
  icon: (componentLogoMap[name as ComponentName] as LogoComponent | undefined) ?? Box,
});

// The wrapper owns the size and the ellipsis, so a long name truncates inside the cell.
const PipelineNameLink = ({ pipelineId, name }: { pipelineId: string; name: string }) => (
  <div className="truncate text-body-lg">
    <Link
      as={TanStackRouterLink}
      params={{ pipelineId: encodeURIComponent(pipelineId) }}
      title={name}
      to="/rp-connect/$pipelineId"
    >
      {name}
    </Link>
  </div>
);

const PipelineNameCell = ({ pipeline, name }: { pipeline: Pipeline; name: string }) => {
  const { id, isDraft: isDraftRow, editedAt } = pipeline;
  return (
    <div className="flex max-w-[300px] flex-col gap-0.5 overflow-hidden">
      <PipelineNameLink name={name} pipelineId={id} />
      {isDraftRow && editedAt ? (
        <span className="truncate text-body-sm text-muted-foreground">Edited {relativeAgeLabel(editedAt)}</span>
      ) : null}
      {!isDraftRow && id !== name ? (
        // select-all: one click selects the whole id, and the row's guard keeps it from navigating.
        <ElementTooltip content={id}>
          <span className="cursor-text truncate font-mono text-body-sm text-muted-foreground select-all">{id}</span>
        </ElementTooltip>
      ) : null}
    </div>
  );
};

const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
}: CreateColumnsOptions): DataTableColumnDef<Pipeline>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pipeline" />,
    filterFn: (row, _columnId, filterValue: string) => matchesNameOrId(filterValue, row.original.name, row.original.id),
    cell: ({ row }) => <PipelineNameCell name={row.getValue('name') as string} pipeline={row.original} />,
  },
  {
    accessorKey: 'inputs',
    header: 'Input',
    filterFn: 'arrIncludesSome',
    // Without this, faceting keys on the array itself and the per-option counts never resolve.
    // Deduplicated per row, or two `redpanda` inputs would count 2 against a single row.
    getUniqueValues: (row) => [...new Set(row.inputs)],
    cell: ({ row }) => <ConnectorBadges names={row.getValue('inputs') as string[]} />,
  },
  {
    accessorKey: 'outputs',
    header: 'Output',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => [...new Set(row.outputs)],
    cell: ({ row }) => <ConnectorBadges names={row.getValue('outputs') as string[]} />,
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags.map(tagFilterValue),
    header: 'Tags',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => row.tags.map(tagFilterValue),
    cell: ({ row }) => {
      const tags = row.original.tags;
      if (tags.length === 0) {
        return <EmptyCell />;
      }
      return (
        <BadgeGroup
          maxVisible={2}
          renderOverflowContent={(overflow) => (
            <List>
              {tags.slice(-overflow.length).map((t) => (
                <ListItem key={t.key}>
                  {t.key}: {t.value}
                </ListItem>
              ))}
            </List>
          )}
          tone="default"
          variant="outline"
        >
          {tags.map((t) => (
            <Badge key={t.key} tone="default" variant="outline">
              {t.key}: {t.value}
            </Badge>
          ))}
        </BadgeGroup>
      );
    },
  },
  {
    id: 'state',
    accessorFn: (row) => String(row.state),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    filterFn: stateInFilterFn,
    // Unknown states sort last; drafts tie-break on recency.
    sortFn: (rowA, rowB) => {
      const byState = sortPriority(rowA.original) - sortPriority(rowB.original);
      if (byState !== 0 || !(rowA.original.isDraft && rowB.original.isDraft)) {
        return byState;
      }
      return (rowB.original.editedAt ?? 0) - (rowA.original.editedAt ?? 0);
    },
    // Label from the state, not the variant: COMPLETED and RUNNING share `success`, whose default
    // copy is "Running".
    cell: ({ row }) => (
      <StatusBadge
        size="sm"
        title={row.original.isDraft ? DRAFT_BADGE_TOOLTIP : undefined}
        variant={PIPELINE_STATE_STATUS_VARIANT[row.original.state] ?? 'disabled'}
      >
        {PIPELINE_STATE_LABELS[row.original.state] ?? 'Unknown'}
      </StatusBadge>
    ),
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => (
      <ActionsCell
        deleteMutation={deleteMutation}
        isDeletingPipeline={isDeletingPipeline}
        navigate={navigate}
        pipeline={row.original}
        startMutation={startMutation}
        stopMutation={stopMutation}
      />
    ),
  },
];

// Pages still unfetched means partial data; otherwise a background refresh failed and it's stale.
const listErrorMessageFor = (error: { message: string } | null, hasNextPage: boolean | undefined): string | null => {
  if (!error) {
    return null;
  }
  return hasNextPage
    ? `Failed to load all pipelines: ${error.message}`
    : `Couldn't refresh pipelines: ${error.message}`;
};

const usePipelineListData = () => {
  const {
    data: pipelinesData,
    isLoading,
    error,
    hasNextPage,
  } = useListPipelinesQuery(LIST_WITH_DRAFTS, {
    enableSmartPolling: true,
  });
  const invalidatePipelineQueries = useInvalidatePipelineQueries();
  useEffect(() => {
    appGlobal.onRefresh = () => {
      invalidatePipelineQueries();
    };
  }, [invalidatePipelineQueries]);

  const pipelines = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(transformAPIPipeline),
    [pipelinesData]
  );
  const draftCount = useMemo(() => pipelines.filter((p) => p.isDraft).length, [pipelines]);

  return {
    pipelines,
    draftCount,
    isLoading,
    error,
    // isLoading stays true until every page is drained, so render page one and stream the rest in behind
    // it. A mid-drain error halts the drain for good, so it replaces the spinner.
    isInitialLoading: isLoading && pipelines.length === 0 && !error,
    isLoadingMorePages: isLoading && pipelines.length > 0 && !error,
    listErrorMessage: listErrorMessageFor(error, hasNextPage),
  };
};

const usePipelineListColumns = () => {
  const navigate = useNavigate();
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();

  return useMemo(
    () =>
      createColumns({
        navigate,
        deleteMutation,
        startMutation,
        stopMutation,
        isDeletingPipeline,
      }),
    [navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline]
  );
};

const usePipelinesTable = (pipelines: Pipeline[]) => {
  const columns = usePipelineListColumns();
  // Sort by status so error and transitioning pipelines land on page 1 of a large cluster.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'state', desc: false }]);

  const table = useDataTable({
    data: pipelines,
    columns,
    // Id rather than row index: a row keeps its identity while pages stream in and the sort re-runs,
    // so React reuses its DOM.
    getRowId: (row) => row.id,
    // No column-visibility UI here; also drops Hide from the column header menus.
    enableHiding: false,
    // Also drops the pagination footer's "X of N row(s) selected." text.
    enableRowSelection: false,
    onSortingChange: setSorting,
    // autoResetPageIndex would yank the user to page 1 on every drained page; the layout effects below
    // reset on filter/sort changes instead.
    autoResetPageIndex: false,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: PAGE_SIZE,
      },
    },
  });

  const pageCount = table.getPageCount();
  useLayoutEffect(() => {
    const { pageIndex } = table.state.pagination;
    if (pageIndex > 0 && pageIndex >= pageCount) {
      table.setPageIndex(Math.max(pageCount - 1, 0));
    }
  }, [pageCount, table]);

  const { columnFilters } = table.state;
  // biome-ignore lint/correctness/useExhaustiveDependencies: columnFilters and sorting are the change-triggers — editing either jumps back to page 1. `table` is a new object every render, so depending on it would undo every page move.
  useLayoutEffect(() => {
    if (table.state.pagination.pageIndex !== 0) {
      table.setPageIndex(0);
    }
  }, [columnFilters, sorting]);

  return { table, columns };
};

type PipelinesTable = ReturnType<typeof usePipelinesTable>['table'];

const usePipelineStateTabs = (
  table: PipelinesTable,
  { isLoading, draftCount }: { isLoading: boolean; draftCount: number }
) => {
  const [activeTab, setActiveTab] = useState<PipelineStateTabId>('all');

  // Each tab counts what selecting it would yield: the faceted model applies every filter but its own.
  const stateFacetedRows = table.getColumn('state')?.getFacetedRowModel().flatRows;
  const tabCounts = useMemo(
    () => countPipelinesPerTab((stateFacetedRows ?? []).map((r) => r.original.state)),
    [stateFacetedRows]
  );

  const handleTabChange = useCallback(
    (tabId: PipelineStateTabId) => {
      if (tabId === activeTab) {
        return;
      }
      setActiveTab(tabId);
      const tab = PIPELINE_STATE_TABS.find((t) => t.id === tabId);
      table.getColumn('state')?.setFilterValue(tab ? stateFilterValues(tab) : undefined);
    },
    [table, activeTab]
  );

  const visibleTabs = useMemo(
    () => PIPELINE_STATE_TABS.filter((tab) => tab.id !== 'draft' || draftCount > 0),
    [draftCount]
  );

  // Deleting or starting the last draft hides its tab; not while the drain is still filling it.
  useEffect(() => {
    if (!isLoading && activeTab === 'draft' && draftCount === 0) {
      handleTabChange('all');
    }
  }, [isLoading, activeTab, draftCount, handleTabChange]);

  return { activeTab, handleTabChange, tabCounts, visibleTabs };
};

type PipelineStateTabsState = ReturnType<typeof usePipelineStateTabs>;

const usePipelineNameSearch = (table: PipelinesTable) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const column = table.getColumn('name');
      const next = search.trim() ? search : undefined;
      // setFilterValue(undefined) on an unfiltered column still makes a new columnFilters array, which
      // trips the page-reset effect — so skip no-op writes, including the post-mount tick.
      if (column && column.getFilterValue() !== next) {
        column.setFilterValue(next);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, table]);

  const clearFilters = useCallback(() => {
    setSearch('');
    for (const columnId of ['name', 'inputs', 'outputs', 'tags']) {
      table.getColumn(columnId)?.setFilterValue(undefined);
    }
  }, [table]);

  return {
    search,
    setSearch,
    // Status tabs are views, not filters. Read `search` directly, not its column filter: that lands
    // 200ms later, and Clear filters must be clickable as soon as the user has typed.
    hasActiveFilters: search.trim() !== '' || table.state.columnFilters.some((f) => f.id !== 'state'),
    clearFilters,
  };
};

type PipelineNameSearchState = ReturnType<typeof usePipelineNameSearch>;

const CreatePipelineButton = () => {
  const navigate = useNavigate();
  const resetRpcnWizardStore = useResetRpcnWizardStore();

  const handleCreateClick = useCallback(() => {
    resetRpcnWizardStore();
    navigate({ to: '/rp-connect/create', search: { serverless: undefined } }).catch((error: unknown) => {
      toast.error('Failed to open the pipeline editor', { description: String(error) });
    });
  }, [resetRpcnWizardStore, navigate]);

  return <Button onClick={handleCreateClick}>Create a pipeline</Button>;
};

const PipelineStateTabsBar = ({ tabs }: { tabs: PipelineStateTabsState }) => (
  <Tabs onValueChange={(value) => tabs.handleTabChange(value as PipelineStateTabId)} value={tabs.activeTab}>
    <TabsList className="[&_[data-slot=tabs-trigger]]:w-auto" variant="underline">
      {tabs.visibleTabs.map((tab) => (
        <TabsTrigger
          aria-controls={STATUS_PANEL_ID}
          id={statusTabId(tab.id)}
          key={tab.id}
          value={tab.id}
          variant="underline"
        >
          {tab.label}
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-body-sm text-muted-foreground tabular-nums">
            {tabs.tabCounts[tab.id]}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const PipelineListToolbar = ({
  pipelines,
  table,
  nameSearch,
}: {
  pipelines: Pipeline[];
  table: PipelinesTable;
  nameSearch: PipelineNameSearchState;
}) => {
  const inputOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.inputs))].map(connectorOption),
    [pipelines]
  );
  const outputOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.outputs))].map(connectorOption),
    [pipelines]
  );
  const tagOptions = useMemo(
    () => [...new Set(pipelines.flatMap((p) => p.tags.map(tagFilterValue)))].map((v) => ({ value: v, label: v })),
    [pipelines]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Search pipelines by name or ID"
        className="w-64"
        onChange={(e) => nameSearch.setSearch(e.target.value)}
        placeholder="Search by name or ID..."
        value={nameSearch.search}
      >
        <InputStart>
          <TonedIcon className="h-4 w-4" icon={Search} tone="muted" />
        </InputStart>
      </Input>
      <DataTableFacetedFilter column={table.getColumn('inputs')} options={inputOptions} title="Input" />
      <DataTableFacetedFilter column={table.getColumn('outputs')} options={outputOptions} title="Output" />
      <DataTableFacetedFilter column={table.getColumn('tags')} options={tagOptions} title="Tags" />
      <FadePresence show={nameSearch.hasActiveFilters}>
        <Button onClick={nameSearch.clearFilters} size="sm" variant="ghost">
          <X /> Clear filters
        </Button>
      </FadePresence>
    </div>
  );
};

// ⌘/middle-click mean "open elsewhere" — leave them to the name cell's link. The registry guard, same one
// DataTable's rows use, drops clicks on a control in the row, and portaled children (open menus, the
// delete-confirm backdrop) that bubble outside the <tr>. A mouseup that ends a text selection (copying the
// id) isn't navigation intent.
const isRowNavigationClick = (event: MouseEvent<HTMLTableRowElement>): boolean =>
  !isModifiedClick(event) &&
  isRowActivationClick(event.target, event.currentTarget) &&
  !window.getSelection()?.toString();

const PipelineListTable = ({
  table,
  columnCount,
  emptyContent,
}: {
  table: PipelinesTable;
  columnCount: number;
  emptyContent: ReactNode;
}) => {
  const navigate = useNavigate();
  const { rows } = table.getRowModel();

  const handleRowClick = useCallback(
    (pipelineId: string, event: MouseEvent<HTMLTableRowElement>) => {
      if (isRowNavigationClick(event)) {
        navigate({ to: '/rp-connect/$pipelineId', params: { pipelineId: encodeURIComponent(pipelineId) } }).catch(
          (error: unknown) => {
            toast.error('Failed to open the pipeline', { description: String(error) });
          }
        );
      }
    },
    [navigate]
  );

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center" colSpan={columnCount}>
              {emptyContent}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            // Pointer shortcut only: the name cell holds the same link, so a row tab stop would
            // duplicate it on every row.
            <TableRow
              className="cursor-pointer"
              key={row.id}
              onClick={(event) => handleRowClick(row.original.id, event)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{<table.FlexRender cell={cell} />}</TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

const PipelineListPageContent = () => {
  const list = usePipelineListData();
  const { table, columns } = usePipelinesTable(list.pipelines);
  const tabs = usePipelineStateTabs(table, list);
  const nameSearch = usePipelineNameSearch(table);

  if (list.isInitialLoading) {
    return <PipelineListSkeleton />;
  }

  if (list.error && list.pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-destructive">
        <AlertCircle className="h-4 w-4" />
        Error loading pipelines: {list.error.message}
      </div>
    );
  }

  const hasRows = table.getRowModel().rows.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <PipelineStateTabsBar tabs={tabs} />
        <CreatePipelineButton />
      </div>
      <PipelineListToolbar nameSearch={nameSearch} pipelines={list.pipelines} table={table} />
      <div aria-labelledby={statusTabId(tabs.activeTab)} id={STATUS_PANEL_ID} role="tabpanel">
        <PipelineListTable
          columnCount={columns.length}
          emptyContent={
            list.isLoadingMorePages ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Spinner /> Loading pipelines...
              </div>
            ) : (
              pipelineListEmptyText({
                hasActiveFilters: nameSearch.hasActiveFilters,
                activeTab: tabs.activeTab,
                totalPipelines: list.pipelines.length,
              })
            )
          }
          table={table}
        />
      </div>
      <FadePresence show={list.isLoadingMorePages && hasRows}>
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <Spinner /> Loading more pipelines...
        </div>
      </FadePresence>
      <FadePresence show={Boolean(list.listErrorMessage) && list.pipelines.length > 0}>
        <div className="flex items-center gap-2 text-body text-destructive">
          <AlertCircle className="h-4 w-4" />
          {list.listErrorMessage}
        </div>
      </FadePresence>
      <ListStatusAnnouncements isLoadingMorePages={list.isLoadingMorePages} listErrorMessage={list.listErrorMessage} />
      <DataTablePagination table={table} />
    </div>
  );
};

const RedpandaConnectContent = () => (
  <div className="flex flex-col gap-4">
    <div className="text-body">
      Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that drive
      real-time analytics and actionable business insights. Integrate data across systems with hundreds of prebuilt
      connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.{' '}
      <Link href={docsLinks.cloud.connectAbout} rel="noopener noreferrer" target="_blank">
        Learn more
      </Link>
    </div>
    <PipelineListPageContent />
  </div>
);

export const PipelineListPage = () => {
  const { data: kafkaConnectors, isLoading: isLoadingKafkaConnect } = useKafkaConnectConnectorsQuery();

  const isKafkaConnectEnabled = kafkaConnectors?.isConfigured === true;
  const showKafkaConnectLoadingHint = isLoadingKafkaConnect && !kafkaConnectors;

  if (!isKafkaConnectEnabled) {
    return (
      <div className="flex flex-col gap-4">
        {showKafkaConnectLoadingHint ? (
          <div className="flex items-center gap-2 text-body text-muted-foreground">
            <Spinner />
            <div className="text-body text-muted-foreground">Checking for Kafka Connect availability...</div>
          </div>
        ) : null}
        <RedpandaConnectContent />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-body">
        There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and Kafka
        Connect.
      </div>
      <Tabs defaultValue="redpanda-connect">
        <TabsList variant="underline">
          <TabsTrigger value="redpanda-connect" variant="underline">
            Redpanda Connect
          </TabsTrigger>
          <TabsTrigger value="kafka-connect" variant="underline">
            Kafka Connect
          </TabsTrigger>
        </TabsList>
        <TabsContents>
          <div className="p-6">
            {/* keepMounted: panels unmount by default, dropping search/facets/page on a trip to the
                Kafka Connect tab and back. */}
            <TabsContent keepMounted value="redpanda-connect">
              <RedpandaConnectContent />
            </TabsContent>
            <TabsContent value="kafka-connect">
              <div className="flex flex-col gap-6">
                <div className="text-body">
                  Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data
                  with different data systems.{' '}
                  <Link href={docsLinks.cloud.managedConnectors} rel="noopener noreferrer" target="_blank">
                    Learn more
                  </Link>
                </div>
                <TabKafkaConnect />
              </div>
            </TabsContent>
          </div>
        </TabsContents>
      </Tabs>
    </div>
  );
};
