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

import { Box, Checkbox, DataTable, Flex, Popover, Text } from '@redpanda-data/ui';
import type { Row } from '@tanstack/react-table';
import { computed, type IReactionDisposer, makeObservable, observable, transaction } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import Highlighter from 'react-highlight-words';
import { MdOutlineWarningAmber } from 'react-icons/md';

import { SelectionInfoBar } from './components/StatisticsBar';
import type { PartitionSelection } from './ReassignPartitions';
import { api } from '../../../state/backendApi';
import type { Partition, PartitionReassignmentsPartition, Topic } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, InfoText, ZeroSizeWrapper } from '../../../utils/tsxUtils';
import { prettyBytesOrNA } from '../../../utils/utils';
import { BrokerList } from '../../misc/BrokerList';
import { renderLogDirSummary, WarningToolip } from '../../misc/common';
import { SearchTitle } from '../../misc/KowlTable';

export type TopicWithPartitions = Topic & {
  partitions: Partition[];
  activeReassignments: PartitionReassignmentsPartition[];
};

@observer
export class StepSelectPartitions extends Component<{
  partitionSelection: PartitionSelection;
  throttledTopics: string[];
}> {
  autorunHandle: IReactionDisposer | undefined = undefined;
  @observable filterOpen = false; // topic name searchbar

  @observable selectedBrokerFilters: (string | number)[] | null = null;

  constructor(props: any) {
    super(props);
    this.setSelection = this.setSelection.bind(this);
    this.setTopicSelection = this.setTopicSelection.bind(this);
    this.isSelected = this.isSelected.bind(this);
    this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
    this.getTopicCheckState = this.getTopicCheckState.bind(this);
    this.getRowKey = this.getRowKey.bind(this);
    makeObservable(this);
  }

  componentWillUnmount() {
    if (this.autorunHandle) {
      this.autorunHandle();
      this.autorunHandle = undefined;
    }
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
            {
              id: 'check',
              header: '',
              cell: observer(({ row }: { row: Row<TopicWithPartitions> }) => {
                const { checked, indeterminate } = this.getTopicCheckState(row.original.topicName);
                return (
                  <Checkbox
                    isChecked={checked}
                    isIndeterminate={indeterminate}
                    onChange={() => this.setTopicSelection(row.original, !checked)}
                  />
                );
              }),
            },
            {
              id: 'topicName',
              header: () => (
                <SearchTitle observableFilterOpen={this} observableSettings={uiSettings.reassignment} title="Topic" />
              ),
              accessorKey: 'topicName',
              cell: ({ row: { original: record } }) => {
                const content = filterActive ? (
                  <Highlighter searchWords={[query]} textToHighlight={record.topicName} />
                ) : (
                  record.topicName
                );

                if (this.props.throttledTopics.includes(record.topicName)) {
                  return (
                    <Box whiteSpace="break-spaces" wordBreak="break-word">
                      <span>{content}</span>
                      <WarningToolip content="Topic replication is throttled" position="top" />
                    </Box>
                  );
                }

                return (
                  <Box whiteSpace="break-spaces" wordBreak="break-word">
                    {content}
                  </Box>
                );
              },
              size: Number.POSITIVE_INFINITY,
            },
            {
              header: 'Partitions',
              cell: ({ row: { original: topic } }) => {
                const errors = topic.partitions.count((p) => p.hasErrors);
                if (errors === 0) {
                  return topic.partitionCount;
                }

                return (
                  <Flex alignItems="center" flexDirection="row" gap={2}>
                    {renderPartitionErrorsForTopic(errors)}
                    <Text>
                      {topic.partitionCount - errors} / {topic.partitionCount}
                    </Text>
                  </Flex>
                );
              },
              accessorKey: 'partitions',
            },
            {
              header: 'Replication Factor',
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
              accessorKey: 'replicationFactor',
            },
            {
              header: 'Brokers',
              accessorKey: 'partitions',
              cell: ({ row: { original: record } }) =>
                record.partitions?.map((p) => p.leader).distinct().length ?? 'N/A',
            },
            {
              header: 'Size',
              cell: ({ row: { original: r } }) => renderLogDirSummary(r.logDirSummary),
              accessorKey: 'totalSizeBytes',
            },
          ]}
          data={this.topicPartitions}
          onRowSelectionChange={(_data) => {}}
          pagination={true}
          rowSelection={{
            _internal_connectors_configs: true,
          }}
          sorting={true}
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
    transaction(() => {
      for (const p of topic.partitions) {
        const selected = isSelected && !p.hasErrors;
        this.setSelection(topic.topicName, p.id, selected);
      }
    });
  }

  setSelection(topic: string, partition: number, isSelected: boolean) {
    const partitions = this.props.partitionSelection[topic] ?? [];

    if (isSelected) {
      partitions.pushDistinct(partition);
    } else {
      partitions.remove(partition);
    }

    if (partitions.length === 0) {
      delete this.props.partitionSelection[topic];
    } else {
      this.props.partitionSelection[topic] = partitions;
    }
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

  @computed get topicPartitions(): TopicWithPartitions[] {
    if (api.topics == null) {
      return [];
    }
    return api.topics
      .map((topic) => {
        return {
          ...topic,
          // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
          partitions: api.topicPartitions.get(topic.topicName)!,
          activeReassignments: this.inProgress.get(topic.topicName) ?? [],
        };
      })
      .filter((t) => t.activeReassignments.length === 0);
  }

  @computed get inProgress() {
    const current = api.partitionReassignments ?? [];
    return current.toMap(
      (x) => x.topicName,
      (x) => x.partitions
    );
  }
}

@observer
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
            header: 'Check',
            cell: observer(({ row: { original: partition } }: { row: Row<Partition> }) => {
              const isSelected = this.props.getSelectedPartitions().includes(partition.id);
              return (
                <Checkbox
                  isChecked={isSelected}
                  onChange={() => {
                    this.props.setSelection(this.props.topic.topicName, partition.id, !isSelected);
                  }}
                />
              );
            }),
          },
          {
            header: 'Partition',
            accessorKey: 'id',
            size: Number.POSITIVE_INFINITY,
          },
          {
            header: 'Brokers',
            cell: observer(({ row: { original: partition } }: { row: Row<Partition> }) =>
              partition.replicas ? (
                <BrokerList brokerIds={partition.replicas} leaderId={partition.leader} />
              ) : (
                renderPartitionError(partition)
              )
            ),
          },
          {
            header: 'Size',
            cell: ({ row: { original: partition } }) => prettyBytesOrNA(partition.replicaSize),
            size: Number.POSITIVE_INFINITY,
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
    <Popover
      content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>{txt}</div>}
      hideCloseButton
      placement="right-start"
      size="auto"
      title="Partition Error"
    >
      <span>
        <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
          <MdOutlineWarningAmber color="orange" size={19} />
        </ZeroSizeWrapper>
      </span>
    </Popover>
  );
}

function renderPartitionErrorsForTopic(_partitionsWithErrors: number) {
  return (
    <Popover
      content={
        <div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
          Some partitions could not be retreived.
          <br />
          Expand the topic to see which partitions are affected.
        </div>
      }
      hideCloseButton
      placement="right-start"
      size="auto"
      title="Partition Error"
    >
      <span>
        <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
          <MdOutlineWarningAmber color="orange" size={20} />
        </ZeroSizeWrapper>
      </span>
    </Popover>
  );
}
