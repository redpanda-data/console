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
import { DataTable, DataTableColumnHeader, type DataTableRow } from 'components/redpanda-ui/components/data-table';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Component } from 'react';
import Highlighter from 'react-highlight-words';

import { SelectionInfoBar } from './components/statistics-bar';
import type { PartitionSelection } from './reassign-partitions';
import { api } from '../../../state/backend-api';
import type { Partition, PartitionReassignmentsPartition, Topic } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, InfoText, ZeroSizeWrapper } from '../../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../../utils/utils';
import { BrokerList } from '../../misc/broker-list';
import { renderLogDirSummary, WarningToolip } from '../../misc/common';
import { SearchTitle } from '../../misc/kowl-table';

export type TopicWithPartitions = Topic & {
  partitions: Partition[];
  activeReassignments: PartitionReassignmentsPartition[];
};

export class StepSelectPartitions extends Component<{
  partitionSelection: PartitionSelection;
  onPartitionSelectionChange: (newSelection: PartitionSelection) => void;
  throttledTopics: string[];
}> {
  filterOpen = false; // topic name searchbar

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
    this.getRowKey = this.getRowKey.bind(this);
  }

  render() {
    if (!api.topics) {
      return DefaultSkeleton;
    }

    const query = uiSettings.reassignment.quickSearch ?? '';
    const filterActive = query.length > 1;

    return (
      <div style={{ margin: '1em 1em 2em 1em' }}>
        {/* Current Selection */}
        <SelectionInfoBar margin="2em 0em 1em 0.3em" partitionSelection={this.props.partitionSelection} />

        <DataTable<TopicWithPartitions>
          columns={[
            // Chakra's DataTable injected this column whenever `subComponent` was set; the Registry one does not.
            {
              id: 'expander',
              size: 40,
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
              header: () => (
                <SearchTitle observableFilterOpen={this} observableSettings={uiSettings.reassignment} title="Topic" />
              ),
              accessorKey: 'topicName',
              // This column's header *is* the search control (SearchTitle), so there is nowhere to
              // put a sort affordance — the model says so rather than enabling sorting with no UI.
              enableSorting: false,
              enableHiding: false,
              cell: ({ row: { original: record } }) => {
                const content = filterActive ? (
                  <Highlighter searchWords={[query]} textToHighlight={record.topicName} />
                ) : (
                  record.topicName
                );

                if (this.props.throttledTopics.includes(record.topicName)) {
                  return (
                    <div className="whitespace-break-spaces break-words">
                      <span>{content}</span>
                      <WarningToolip content="Topic replication is throttled" position="top" />
                    </div>
                  );
                }

                return <div className="whitespace-break-spaces break-words">{content}</div>;
              },
              size: Number.POSITIVE_INFINITY,
            },
            {
              id: 'partitionCount',
              enableHiding: false,
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
              enableHiding: false,
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
              // Distinct id: the "Partitions" column above also keyed off `partitions`, so both
              // resolved to the same TanStack column id.
              id: 'brokers',
              enableSorting: false,
              enableHiding: false,
              header: 'Brokers',
              cell: ({ row: { original: record } }) =>
                record.partitions?.map((p) => p.leader).distinct().length ?? 'N/A',
            },
            {
              id: 'totalSizeBytes',
              enableHiding: false,
              header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
              accessorKey: 'totalSizeBytes',
              cell: ({ row: { original: r } }) => renderLogDirSummary(r.logDirSummary),
            },
          ]}
          data={this.topicPartitions}
          // Chakra took a no-op `onRowSelectionChange` plus a placeholder `rowSelection`; selection
          // is done by the `check` column above, so the Registry table simply leaves it off.
          pagination
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
        />
      </div>
    );
  }

  getRowKey(r: TopicWithPartitions) {
    return r.topicName;
  }

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

  getTopicCheckState(topicName: string): { checked: boolean; indeterminate: boolean } {
    const tp = this.topicPartitions.first((t) => t.topicName === topicName);
    if (!tp) {
      return { checked: false, indeterminate: false };
    }

    const selected = this.props.partitionSelection[topicName];
    if (!selected) {
      return { checked: false, indeterminate: false };
    }

    if (selected.length === 0) {
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
        return []; // skip topics whose partitions haven't loaded yet (e.g. newly created)
      }
      const activeReassignments = this.inProgress.get(topic.topicName) ?? [];
      if (activeReassignments.length > 0) {
        return []; // skip topics with active reassignments
      }
      return [{ ...topic, partitions, activeReassignments }];
    });
  }

  get inProgress() {
    const current = api.partitionReassignments ?? [];
    return current.toMap(
      (x) => x.topicName,
      (x) => x.partitions
    );
  }
}

export class SelectPartitionTable extends Component<{
  topic: Topic;
  topicPartitions: Partition[];
  setSelection: (topic: string, partition: number, isSelected: boolean) => void;
  isSelected: (topic: string, partition: number) => boolean;
  getSelectedPartitions: () => number[];
}> {
  render() {
    return (
      <DataTable<Partition>
        columns={[
          {
            id: 'check',
            enableSorting: false,
            enableHiding: false,
            header: 'Check',
            cell: ({ row: { original: partition } }: { row: DataTableRow<Partition> }) => {
              const isSelected = this.props.getSelectedPartitions().includes(partition.id);
              return (
                <Checkbox
                  aria-label={`Select partition ${partition.id}`}
                  checked={isSelected}
                  onCheckedChange={() => {
                    this.props.setSelection(this.props.topic.topicName, partition.id, !isSelected);
                  }}
                />
              );
            },
          },
          {
            id: 'id',
            enableHiding: false,
            header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
            accessorKey: 'id',
          },
          {
            id: 'replicas',
            enableSorting: false,
            enableHiding: false,
            header: 'Brokers',
            cell: ({ row: { original: partition } }: { row: DataTableRow<Partition> }) =>
              partition.replicas ? (
                <BrokerList brokerIds={partition.replicas} leaderId={partition.leader} />
              ) : (
                renderPartitionError(partition)
              ),
          },
          {
            id: 'replicaSize',
            enableHiding: false,
            header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
            accessorKey: 'replicaSize',
            cell: ({ row: { original: partition } }) => prettyBytesOrNA(partition.replicaSize),
          },
        ]}
        data={this.props.topicPartitions}
        pagination
        sorting
      />
    );
  }

  getCheckboxProps(p: Partition) {
    return { disabled: p.hasErrors };
  }
}

function renderPartitionError(partition: Partition) {
  const txt = [partition.partitionError, partition.waterMarksError].join('\n\n');

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button aria-label="Partition error" type="button">
            <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
              <WarningIcon className="text-warning" size={19} />
            </ZeroSizeWrapper>
          </button>
        }
      />
      <PopoverContent align="start" side="right">
        <div className="font-semibold">Partition Error</div>
        <div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>{txt}</div>
      </PopoverContent>
    </Popover>
  );
}

function PartitionErrorsForTopic(_props: { partitionsWithErrors: number }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button aria-label="Partition error" type="button">
            <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
              <WarningIcon className="text-warning" size={20} />
            </ZeroSizeWrapper>
          </button>
        }
      />
      <PopoverContent align="start" side="right">
        <div className="font-semibold">Partition Error</div>
        <div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
          Some partitions could not be retreived.
          <br />
          Expand the topic to see which partitions are affected.
        </div>
      </PopoverContent>
    </Popover>
  );
}
