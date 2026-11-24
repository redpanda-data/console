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

import { ChevronDownIcon, ChevronRightIcon, WarningIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
  type DataTableRow,
} from 'components/redpanda-ui/components/data-table';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Component } from 'react';

import { SelectionInfoBar } from './components/statistics-bar';
import type { PartitionSelection } from './reassign-partitions';
import { SelectPartitionTable } from './select-partition-table';
import { api } from '../../../state/backend-api';
import type { Partition, PartitionReassignmentsPartition, Topic } from '../../../state/rest-interfaces';
import { DefaultSkeleton, InfoText, ZeroSizeWrapper } from '../../../utils/tsx-utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { renderLogDirSummary, WarningToolip } from '../../misc/common';
import { TonedIcon } from '../shared/toned-icon';

const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};

export { SelectPartitionTable } from './select-partition-table';

export type TopicWithPartitions = Topic & {
  partitions: Partition[];
  activeReassignments: PartitionReassignmentsPartition[];
};

export class StepSelectPartitions extends Component<{
  partitionSelection: PartitionSelection;
  onPartitionSelectionChange: (newSelection: PartitionSelection) => void;
  throttledTopics: string[];
}> {
  private readonly api = api;

  // WARNING: Keep column identities stable; a polling render must not remount an open sort menu.
  private readonly columns: DataTableColumnDef<TopicWithPartitions>[];

  constructor(props: {
    selectedTopicPartitions: PartitionSelection;
    partitionSelection: PartitionSelection;
    onPartitionSelectionChange: (newSelection: PartitionSelection) => void;
    throttledTopics: string[];
  }) {
    super(props);
    this.setSelection = this.setSelection.bind(this);
    this.setTopicSelection = this.setTopicSelection.bind(this);
    this.isSelected = this.isSelected.bind(this);
    this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
    this.getTopicCheckState = this.getTopicCheckState.bind(this);
    this.columns = [
      {
        id: 'expander',
        enableSorting: false,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              aria-expanded={row.getIsExpanded()}
              aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
              onClick={row.getToggleExpandedHandler()}
              size="icon-xs"
              variant="ghost"
            >
              {row.getIsExpanded() ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          ) : null,
      },
      {
        id: 'check',
        header: '',
        cell: ({ row }: { row: DataTableRow<TopicWithPartitions> }) => {
          const { checked, indeterminate } = this.getTopicCheckState(row.original.topicName);
          return (
            <Checkbox
              aria-label={`Select topic ${row.original.topicName}`}
              checked={indeterminate ? 'indeterminate' : checked}
              onCheckedChange={() => this.setTopicSelection(row.original, !checked)}
            />
          );
        },
      },
      {
        id: 'topicName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Topic" />,
        accessorKey: 'topicName',
        cell: ({ row: { original: record } }) => {
          const content = record.topicName;

          if (this.props.throttledTopics.includes(record.topicName)) {
            return (
              <div className="wrap-break-word whitespace-break-spaces">
                <span>{content}</span>
                <WarningToolip content="Topic replication is throttled" position="top" />
              </div>
            );
          }

          return <div className="wrap-break-word whitespace-break-spaces">{content}</div>;
        },
      },
      {
        id: 'partitionCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Partitions" />,
        accessorKey: 'partitionCount',
        cell: ({ row: { original: topic } }) => {
          const errors = topic.partitions.count((p) => p.hasErrors);
          if (errors === 0) {
            return topic.partitionCount;
          }

          return (
            <div className="flex flex-row items-center gap-2">
              <PartitionErrorsForTopic partitionsWithErrors={errors} />
              <div>
                {topic.partitionCount - errors} / {topic.partitionCount}
              </div>
            </div>
          );
        },
      },
      {
        id: 'replicationFactor',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Replication Factor" />,
        accessorKey: 'replicationFactor',
        cell: ({ row: { original: r } }) => {
          if (r.activeReassignments.length === 0) {
            return r.replicationFactor;
          }
          return (
            <InfoText
              maxWidth="180px"
              tooltip="While reassignment is active, replication factor is temporarily doubled."
            >
              {r.replicationFactor}
            </InfoText>
          );
        },
      },
      {
        // WARNING: Keep this column ID distinct from the partition-count column; duplicate IDs share table state.
        id: 'brokers',
        enableSorting: false,
        header: 'Brokers',
        cell: ({ row: { original: record } }) => record.partitions?.map((p) => p.leader).distinct().length ?? 'N/A',
      },
      {
        id: 'totalSizeBytes',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
        accessorFn: (topic) => topic.logDirSummary?.totalSizeBytes ?? 0,
        cell: ({ row: { original: r } }) => renderLogDirSummary(r.logDirSummary),
      },
    ];
  }

  render() {
    if (!api.topics) {
      return DefaultSkeleton;
    }

    return (
      <div style={{ margin: '1em 1em 2em 1em' }}>
        <SelectionInfoBar margin="2em 0em 1em 0.3em" partitionSelection={this.props.partitionSelection} />

        <DataTable<TopicWithPartitions>
          columns={this.columns}
          data={this.topicPartitions}
          pagination={this.topicPartitions.length > DEFAULT_TABLE_PAGE_SIZE}
          sorting
          subComponent={({ row: { original: topic } }) => (
            <SelectPartitionTable
              getSelectedPartitions={() => this.getSelectedPartitions(topic.topicName)}
              isSelected={this.isSelected}
              setSelection={this.setSelection}
              topic={topic}
              topicPartitions={topic.partitions}
            />
          )}
          tableOptions={TABLE_OPTIONS}
        />
      </div>
    );
  }

  getRowKey = getTopicRowKey;

  setTopicSelection(topic: TopicWithPartitions, isSelected: boolean) {
    const newSelection = { ...this.props.partitionSelection };
    const topicPartitions: number[] = [];
    for (const p of topic.partitions) {
      if (isSelected && !p.hasErrors) {
        topicPartitions.push(p.id);
      }
    }
    if (topicPartitions.length === 0) {
      delete newSelection[topic.topicName];
    } else {
      newSelection[topic.topicName] = topicPartitions;
    }
    this.props.onPartitionSelectionChange(newSelection);
  }

  setSelection(topic: string, partition: number, isSelected: boolean) {
    const newSelection = { ...this.props.partitionSelection };
    const partitions = [...(newSelection[topic] ?? [])];

    if (isSelected) {
      partitions.pushDistinct(partition);
    } else {
      partitions.remove(partition);
    }

    if (partitions.length === 0) {
      delete newSelection[topic];
    } else {
      newSelection[topic] = partitions;
    }

    this.props.onPartitionSelectionChange(newSelection);
  }

  getSelectedPartitions(topic: string) {
    const partitions = this.props.partitionSelection[topic];
    if (!partitions) {
      return [];
    }
    return partitions;
  }

  isSelected(topic: string, partition: number) {
    const partitions = this.props.partitionSelection[topic];
    if (!partitions) {
      return false;
    }
    return partitions.includes(partition);
  }

  getTopicCheckState(topicName: string) {
    const tp = this.topicPartitions.first((t) => t.topicName === topicName);
    if (!tp) {
      return { checked: false, indeterminate: false };
    }

    const selected = this.props.partitionSelection[topicName];
    if (!selected || selected.length === 0) {
      return { checked: false, indeterminate: false };
    }

    const validPartitions = tp.partitions.count((x) => !x.hasErrors);
    if (validPartitions > 0 && selected.length === validPartitions) {
      return { checked: true, indeterminate: false };
    }

    return { checked: false, indeterminate: true };
  }

  get topicPartitions(): TopicWithPartitions[] {
    if (api.topics === null) {
      return [];
    }
    return api.topics.flatMap((topic) => {
      const partitions = api.topicPartitions.get(topic.topicName);
      if (!partitions) {
        return [];
      }
      const activeReassignments = this.inProgress.get(topic.topicName) ?? [];
      if (activeReassignments.length > 0) {
        return [];
      }
      return [{ ...topic, partitions, activeReassignments }];
    });
  }

  get inProgress() {
    const current = this.api.partitionReassignments ?? [];
    return current.toMap(
      (x) => x.topicName,
      (x) => x.partitions
    );
  }
}

function getTopicRowKey(r: TopicWithPartitions) {
  return r.topicName;
}

function PartitionErrorsForTopic(_props: { partitionsWithErrors: number }) {
  return (
    <Popover>
      <PopoverTrigger
        delay={200}
        openOnHover
        render={
          <button aria-label="Partition error" type="button">
            <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
              <TonedIcon icon={WarningIcon} size={20} tone="warning" />
            </ZeroSizeWrapper>
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto max-w-[500px]" side="right">
        <PopoverTitle>Partition Error</PopoverTitle>
        <div className="whitespace-pre-wrap">
          Some partitions could not be retreived.
          <br />
          Expand the topic to see which partitions are affected.
        </div>
      </PopoverContent>
    </Popover>
  );
}
