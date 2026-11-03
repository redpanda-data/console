/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link as TanStackRouterLink, type useNavigate } from '@tanstack/react-router';
import type { FilterFn } from '@tanstack/react-table';
import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  type DataTableFeatures,
} from 'components/redpanda-ui/components/data-table';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { Link, List, ListItem } from 'components/redpanda-ui/components/typography';
import {
  PIPELINE_STATE_LABELS,
  PIPELINE_STATE_SORT_PRIORITY,
  PIPELINE_STATE_STATUS_VARIANT,
} from 'components/ui/pipeline/constants';
import { Box, CalendarClock, CalendarMinus, CalendarOff, CalendarX2 } from 'lucide-react';
import { type ComponentType, type SVGProps, useMemo } from 'react';

import { DRAFT_BADGE_TOOLTIP, relativeAgeLabel } from './draft-copy';
import { ActionsCell, type DeleteMutate, type StartMutate, type StopMutate } from './list-actions';
import { compareSchedules, type PipelineRow, tagFilterValue } from './list-row';
import { aggregateConnectors, matchesNameOrId } from './list-utils';
import { PipelineRunsCell } from './pipeline-end-chip';
import { PipelineScheduleCell } from './pipeline-schedule';
import { ConnectorLogo } from '../onboarding/connector-logo';

const EmptyCell = () => <span className="text-muted-foreground">—</span>;

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

// A row matches when its value is one of the selected ones (status, how it runs). autoRemove as the
// built-in array filters do: an empty selection means "no filter", not "match nothing".
const inSelectionFilterFn: FilterFn<DataTableFeatures, PipelineRow> = (row, columnId, filterValue: string[]) =>
  filterValue.includes(row.getValue<string>(columnId));
inSelectionFilterFn.autoRemove = (value) => !value || (Array.isArray(value) && value.length === 0);

const sortPriority = (row: PipelineRow): number => PIPELINE_STATE_SORT_PRIORITY[row.state] ?? Number.MAX_SAFE_INTEGER;

type CreateColumnsOptions = {
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: DeleteMutate;
  startMutation: StartMutate;
  stopMutation: StopMutate;
  isDeletingPipeline: boolean;
  /** Set with the schedule preview on: adds the Schedule column and its row actions. */
  onEditSchedule?: (pipelineId: string) => void;
};

/** The Schedule filter's options, in the column's sort order. */
export const SCHEDULE_FILTER_OPTIONS = [
  { value: 'active', label: 'Scheduled', icon: CalendarClock },
  { value: 'on-hold', label: 'On hold', icon: CalendarX2 },
  { value: 'paused', label: 'Paused', icon: CalendarOff },
  { value: 'none', label: 'Not scheduled', icon: CalendarMinus },
];

const scheduleKey = (row: PipelineRow) => row.schedule?.state ?? 'none';
const scheduleFilterFn: FilterFn<DataTableFeatures, PipelineRow> = (row, _columnId, filterValue: string[]) =>
  filterValue.includes(scheduleKey(row.original));
scheduleFilterFn.autoRemove = inSelectionFilterFn.autoRemove;

const scheduleColumn: DataTableColumnDef<PipelineRow> = {
  id: 'schedule',
  // Undefined without a schedule, so those rows sort last either way; filtered and counted as 'none'.
  accessorFn: (row) => row.schedule?.state,
  getUniqueValues: (row) => [scheduleKey(row)],
  sortUndefined: 'last',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Schedule" />,
  filterFn: scheduleFilterFn,
  sortFn: (rowA, rowB) => compareSchedules(rowA.original, rowB.original),
  cell: ({ row }) =>
    row.original.schedule ? (
      <PipelineScheduleCell end={{ status: row.original.end }} schedule={row.original.schedule.schedule} />
    ) : (
      <EmptyCell />
    ),
};

type LogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Facet options are rebuilt on every drain page and poll tick, so each option's icon is the connector's
// own logo component: a stable type, where a fresh one per render would remount every logo in the open
// popover. The facet list sizes it.
export const connectorOption = (name: string) => ({
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

const PipelineNameCell = ({ pipeline, name }: { pipeline: PipelineRow; name: string }) => {
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

export const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
  onEditSchedule,
}: CreateColumnsOptions): DataTableColumnDef<PipelineRow>[] => [
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
    id: 'end',
    accessorFn: (row) => row.end,
    header: 'Runs',
    filterFn: inSelectionFilterFn,
    cell: ({ row }) => <PipelineRunsCell status={row.original.end} />,
  },
  ...(onEditSchedule ? [scheduleColumn] : []),
  {
    id: 'tags',
    accessorFn: (row) => row.tags.map(tagFilterValue),
    header: 'Tags',
    filterFn: 'arrIncludesSome',
    getUniqueValues: (row) => row.tags.map(tagFilterValue),
    cell: ({ row }) => {
      const { tags } = row.original;
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
    filterFn: inSelectionFilterFn,
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
        onEditSchedule={onEditSchedule}
        pipeline={row.original}
        startMutation={startMutation}
        stopMutation={stopMutation}
      />
    ),
  },
];
