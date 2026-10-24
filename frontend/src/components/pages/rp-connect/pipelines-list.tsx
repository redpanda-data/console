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
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, CloseIcon, HelpIcon, RotateCwIcon, StopCircleIcon, TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { Text } from 'components/redpanda-ui/components/typography';
import type { FC, ReactNode } from 'react';
import { showToast } from 'utils/toast.utils';

import { openDeleteModal } from './modals';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi } from '../../../state/backend-api';
import { Features } from '../../../state/supported-features';
import { useUISettingsStore } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import PageContent from '../../misc/page-content';
import { SearchInput } from '../../misc/search-input';
import { PageComponent, type PageInitHelper } from '../page';

const STATUS_ICON_SIZE = 24;

const statusIconToneVariants = cva('contents', {
  variants: {
    tone: {
      subtle: 'text-subtle',
      success: 'text-success',
      destructive: 'text-destructive',
    },
  },
});

/** Colours a status icon. `contents` draws no box, so the icon itself stays the flex item. */
const StatusIconTone = ({
  tone,
  children,
}: Required<VariantProps<typeof statusIconToneVariants>> & { children: ReactNode }) => (
  <span className={statusIconToneVariants({ tone })}>{children}</span>
);

/**
 * Navigates to /rp-connect/create (legacy flow)
 */
const LegacyCreatePipelineButton = () => (
  <div>
    <Button as={Link} to="/rp-connect/create">
      Create pipeline
    </Button>
  </div>
);

/**
 * Shows image, text, and create button
 */
const LegacyEmptyState = () => (
  <div className="mb-4 flex flex-col items-center justify-center gap-4">
    <img alt="" src={EmptyConnectors} />
    <div>You have no Redpanda Connect pipelines.</div>
    <LegacyCreatePipelineButton />
  </div>
);

export const PipelineStatus = (p: { status: Pipeline_State }) => {
  switch (p.status) {
    case Pipeline_State.UNSPECIFIED:
      return (
        <div className="flex items-center gap-2">
          <CloseIcon color="orange" size={STATUS_ICON_SIZE} /> Unspecified
        </div>
      );
    case Pipeline_State.STARTING:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="subtle">
            <RotateCwIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Starting
        </div>
      );
    case Pipeline_State.RUNNING:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="success">
            <CheckIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Running
        </div>
      );
    case Pipeline_State.COMPLETED:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="success">
            <CheckIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Completed
        </div>
      );
    case Pipeline_State.STOPPING:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="subtle">
            <RotateCwIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Stopping
        </div>
      );
    case Pipeline_State.STOPPED:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="subtle">
            <StopCircleIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Stopped
        </div>
      );
    case Pipeline_State.ERROR:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="destructive">
            <CloseIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Error
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2">
          <StatusIconTone tone="destructive">
            <HelpIcon size={STATUS_ICON_SIZE} />
          </StatusIconTone>{' '}
          Unknown
        </div>
      );
  }
};

export const PipelineThroughput = (p: { pipeline: Pipeline }) => {
  const { resources } = p.pipeline;
  if (!resources) {
    return null;
  }

  return (
    <>
      {resources.cpuShares} {resources.memoryShares}
    </>
  );
};

// Legacy table parity: 50 rows a page, pager only past that. No column-visibility UI, so hiding
// is off at table level.
const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};

// Hoisted: `PageComponent` force-updates on every api-store write, and a fresh array would
// re-create every header and cell.
const columns: DataTableColumnDef<Pipeline>[] = [
  {
    header: 'ID',
    id: 'id',
    enableSorting: false,
    cell: ({ row: { original } }) => (
      <Link
        params={{ pipelineId: encodeURIComponentPercents(original.id) }}
        search={{} as never}
        to="/rp-connect/$pipelineId"
      >
        <Text>{original.id}</Text>
      </Link>
    ),
  },
  {
    header: 'Pipeline',
    id: 'pipeline',
    enableSorting: false,
    // The Registry DataTable ignores column sizes.
    cell: ({ row: { original } }) => (
      <div className="w-screen max-w-full">
        <Link
          params={{ pipelineId: encodeURIComponentPercents(original.id) }}
          search={{} as never}
          to="/rp-connect/$pipelineId"
        >
          <Text className="wrap-break-word whitespace-break-spaces">{original.displayName}</Text>
        </Link>
      </div>
    ),
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    id: 'description',
    accessorKey: 'description',
    cell: ({ row: { original } }) => (
      <Text className="min-w-[200px] wrap-break-word whitespace-break-spaces">{original.description}</Text>
    ),
  },
  {
    header: 'State',
    id: 'state',
    enableSorting: false,
    cell: ({ row: { original } }) => <PipelineStatus status={original.state} />,
  },
  {
    header: '',
    id: 'actions',
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <Button
        aria-label={`Delete pipeline ${r.displayName}`}
        onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          e.stopPropagation();
          e.preventDefault();

          openDeleteModal(r.displayName, () => {
            pipelinesApi
              .deletePipeline(r.id)
              .then(async () => {
                showToast({
                  status: 'success',
                  duration: 4000,
                  title: 'Pipeline deleted',
                });
                await pipelinesApi.refreshPipelines(true);
              })
              .catch((err) => {
                showToast({
                  status: 'error',
                  title: 'Failed to delete pipeline',
                  description: String(err),
                });
              });
          });
        }}
        size="icon-xs"
        variant="ghost"
      >
        <TrashIcon />
      </Button>
    ),
  },
];

// biome-ignore lint/complexity/noBannedTypes: empty object represents pages with no route params
class RpConnectPipelinesList extends PageComponent<{}> {
  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Redpanda Connect Pipelines', '/rp-connect');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (!Features.pipelinesApi) {
      return;
    }

    pipelinesApi.refreshPipelines(force).catch((err) => {
      if (String(err).includes('404')) {
        // Hacky special handling for OSS version, it is possible for the /endpoints request to not complete in time for this to render
        // so in this case there would be an error shown because we were too fast (with rendering, or the req was too slow)
        // We don't want to show an error in that case
        return;
      }

      if (Features.pipelinesApi) {
        showToast({
          status: 'error',
          title: 'Failed to load pipelines',
          description: String(err),
        });
      }
    });
  }

  render() {
    return <RpConnectPipelinesListContent />;
  }
}

/** The quick-search text as a case-insensitive pattern, or `null` when it is not a valid one. */
const toQuickSearchRegExp = (quickSearch: string): RegExp | null => {
  try {
    return new RegExp(quickSearch, 'i');
  } catch {
    return null;
  }
};

// A nested write on the `uiSettings` proxy notifies nobody, so this subscribes to the store.
const RpConnectPipelinesListContent: FC = () => {
  const { pipelinesList, updateSettings } = useUISettingsStore();

  if (!pipelinesApi.pipelines) {
    return DefaultSkeleton;
  }

  const quickSearch = pipelinesList.quickSearch;
  // Compiled once, not once per row. An invalid pattern matches nothing, as before.
  const quickSearchRegExp = quickSearch ? toQuickSearchRegExp(quickSearch) : null;

  const filteredPipelines = (pipelinesApi.pipelines ?? [])
    ?.filter((pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_type !== 'agent') // Ensure we do not show the agents
    .filter((u) => {
      if (!quickSearch) {
        return true;
      }
      if (!quickSearchRegExp) {
        return false;
      }
      return quickSearchRegExp.test(u.id) || quickSearchRegExp.test(u.displayName);
    });

  return (
    <PageContent>
      {pipelinesApi.pipelines.length !== 0 && (
        <div className="my-5 flex flex-col gap-2">
          <LegacyCreatePipelineButton />
          <SearchInput
            containerClassName="max-w-[350px]"
            onChange={(value) => updateSettings({ pipelinesList: { quickSearch: value } })}
            placeholder="Enter search term / regex..."
            value={quickSearch}
          />
        </div>
      )}

      {(pipelinesApi.pipelines ?? []).length === 0 ? (
        <LegacyEmptyState />
      ) : (
        <DataTable<Pipeline>
          columns={columns}
          data={filteredPipelines}
          pagination={filteredPipelines.length > DEFAULT_TABLE_PAGE_SIZE}
          sorting
          tableOptions={TABLE_OPTIONS}
        />
      )}
    </PageContent>
  );
};

export default RpConnectPipelinesList;
