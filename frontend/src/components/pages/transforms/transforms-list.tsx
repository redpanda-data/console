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
import { CheckIcon, CloseIcon, TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { Link as ExternalLink } from 'components/redpanda-ui/components/typography';
import { SearchIcon, XIcon } from 'lucide-react';
import type { FC } from 'react';
import { docsLinks } from 'utils/docs-links';
import { showToast } from 'utils/toast.utils';

import { openDeleteModal } from './modals';
import {
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1/transform_pb';
import { appGlobal } from '../../../state/app-global';
import { transformsApi } from '../../../state/backend-api';
import { useUISettingsStore } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';

export const PartitionStatus = (p: { status: PartitionTransformStatus_PartitionStatus }) => {
  switch (p.status) {
    case PartitionTransformStatus_PartitionStatus.UNSPECIFIED:
      return (
        <div className="flex items-center gap-2">
          <CloseIcon className="size-3.5 text-warning" /> Unspecified
        </div>
      );
    case PartitionTransformStatus_PartitionStatus.RUNNING:
      return (
        <div className="flex items-center gap-2">
          <CheckIcon className="size-3.5 text-success" /> Running
        </div>
      );
    case PartitionTransformStatus_PartitionStatus.INACTIVE:
      return (
        <div className="flex items-center gap-2">
          <CloseIcon className="size-3.5 text-destructive" /> Inactive
        </div>
      );
    case PartitionTransformStatus_PartitionStatus.ERRORED:
      return (
        <div className="flex items-center gap-2">
          <CloseIcon className="size-3.5 text-destructive" /> Errored
        </div>
      );
    default:
      return 'Unknown';
  }
};

class TransformsList extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Data Transforms', '/transforms');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    transformsApi.refreshTransforms(force);
  }

  render() {
    return <TransformsListContent />;
  }
}

const columns: DataTableColumnDef<TransformMetadata>[] = [
  {
    id: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    accessorKey: 'name',
    size: 300,
    cell: ({ row: { original: r } }) => (
      <div className="whitespace-break-spaces break-words">
        <Link
          params={{ transformName: encodeURIComponentPercents(r.name) }}
          search={{} as never}
          to="/transforms/$transformName"
        >
          {r.name}
        </Link>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row: { original: r } }) => {
      if (r.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING)) {
        return <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />;
      }
      // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
      const partitionTransformStatus = r.statuses.first(
        (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING
      )!;

      return <PartitionStatus status={partitionTransformStatus.status} />;
    },
  },
  {
    id: 'inputTopicName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Input topic" />,
    accessorKey: 'inputTopicName',
  },
  {
    id: 'outputTopicNames',
    header: 'Output topics',
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <div className="flex flex-col">
        {r.outputTopicNames.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
    ),
  },
  {
    header: '',
    id: 'actions',
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <Button
        aria-label={`Delete transform ${r.name}`}
        onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          e.stopPropagation();
          e.preventDefault();

          openDeleteModal(r.name, () => {
            transformsApi
              .deleteTransform(r.name)
              .then(() => {
                showToast({
                  status: 'success',
                  duration: 4000,
                  title: 'Transform deleted',
                });
                transformsApi.refreshTransforms(true);
              })
              .catch((err) => {
                showToast({
                  status: 'error',
                  title: 'Failed to delete transform',
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
    size: 1,
  },
];

const TransformsListContent: FC = () => {
  const { transformsList, updateSettings } = useUISettingsStore();

  if (!transformsApi.transforms) {
    return DefaultSkeleton;
  }
  if (transformsApi.transforms.length === 0) {
    appGlobal.historyReplace('/transforms-setup');
    return null;
  }

  const quickSearch = transformsList.quickSearch;
  const filteredTransforms = (transformsApi.transforms ?? []).filter((u) => {
    if (!quickSearch) {
      return true;
    }
    try {
      const quickSearchRegExp = new RegExp(quickSearch, 'i');
      return u.name.match(quickSearchRegExp);
    } catch {
      return false;
    }
  });

  return (
    <PageContent>
      <p className="max-w-[600px] text-body">
        Data transforms let you run common data streaming tasks, like filtering, scrubbing, and transcoding, within
        Redpanda.{' '}
        <ExternalLink href={docsLinks.selfManaged.dataTransforms} rel="noopener noreferrer" target="_blank">
          Learn more
        </ExternalLink>
      </p>

      <div className="mb-6 flex flex-row gap-2">
        <Link to="/transforms-setup">
          <Button variant="outline">Create transform</Button>
        </Link>

        <Button disabled variant="outline">
          Export metrics
        </Button>
      </div>

      <Section>
        <div className="mb-5">
          <Input
            containerClassName="max-w-[350px]"
            onChange={(e) => updateSettings({ transformsList: { quickSearch: e.target.value } })}
            placeholder="Enter search term / regex..."
            testId="search-field-input"
            value={quickSearch}
          >
            <InputStart>
              <SearchIcon className="size-4 text-muted-foreground" data-testid="search-field-search-icon" />
            </InputStart>
            {quickSearch !== '' && (
              <InputEnd className="pointer-events-auto">
                <Button
                  aria-label="Clear search"
                  data-testid="search-field-reset-icon"
                  onClick={() => updateSettings({ transformsList: { quickSearch: '' } })}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </InputEnd>
            )}
          </Input>
        </div>

        <DataTable<TransformMetadata> columns={columns} data={filteredTransforms} pagination sorting />
      </Section>
    </PageContent>
  );
};

export default TransformsList;
