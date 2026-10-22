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
import type { ComponentName } from 'assets/connectors/component-logo-map';
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
import { Box } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import type {
  useDeletePipelineMutation,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';

import { DRAFT_BADGE_TOOLTIP, relativeAgeLabel } from './draft-copy';
import { ActionsCell } from './list-actions';
import { type PipelineRow, tagFilterValue } from './list-row';
import { aggregateConnectors, matchesNameOrId } from './list-utils';
import { PipelineRunsCell } from './pipeline-end-chip';
import { areSchedulesEnabled, PipelineScheduleLine } from './pipeline-schedule';
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
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
};

// Facet options are rebuilt on every drain page and poll tick, and a fresh component type per render
// remounts every logo in the open popover.
const connectorIcons = new Map<string, (props: { className?: string }) => ReactElement>();

const connectorIcon = (name: string) => {
  const cached = connectorIcons.get(name);
  if (cached) {
    return cached;
  }
  const Icon = (props: { className?: string }) => (
    <ConnectorLogo fallback={Box} name={name as ComponentName} {...props} />
  );
  connectorIcons.set(name, Icon);
  return Icon;
};

export const connectorOption = (name: string) => ({
  value: name,
  label: name,
  icon: connectorIcon(name),
});

export const createColumns = ({
  navigate,
  deleteMutation,
  startMutation,
  stopMutation,
  isDeletingPipeline,
}: CreateColumnsOptions): DataTableColumnDef<PipelineRow>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pipeline" />,
    filterFn: (row, _columnId, filterValue: string) => matchesNameOrId(filterValue, row.original.name, row.original.id),
    cell: ({ row }) => {
      const { id, isDraft: isDraftRow, editedAt } = row.original;
      const name = row.getValue('name') as string;
      return (
        <div className="flex max-w-[300px] flex-col gap-0.5 overflow-hidden">
          {/* Rows navigate on click, so the link underlines on hover only. */}
          <Link
            as={TanStackRouterLink}
            className="block truncate text-body-lg text-primary no-underline hover:underline"
            params={{ pipelineId: encodeURIComponent(id) }}
            title={name}
            to="/rp-connect/$pipelineId"
          >
            {name}
          </Link>
          {isDraftRow && editedAt ? (
            <span className="truncate text-body-sm text-muted-foreground">Edited {relativeAgeLabel(editedAt)}</span>
          ) : null}
          {!isDraftRow && id !== name ? (
            // select-all: one click selects the whole id, and the row's guard keeps it from navigating.
            <span className="cursor-text select-all truncate font-mono text-body-sm text-muted-foreground" title={id}>
              {id}
            </span>
          ) : null}
        </div>
      );
    },
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
    cell: ({ row }) =>
      areSchedulesEnabled() ? (
        <div className="flex flex-col items-start gap-0.5">
          <PipelineRunsCell status={row.original.end} />
          <PipelineScheduleLine end={{ status: row.original.end }} pipelineId={row.original.id} />
        </div>
      ) : (
        <PipelineRunsCell status={row.original.end} />
      ),
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
        pipeline={row.original}
        startMutation={startMutation}
        stopMutation={stopMutation}
      />
    ),
  },
];
