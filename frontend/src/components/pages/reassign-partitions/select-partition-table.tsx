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

import { WarningIcon } from 'components/icons';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
  type DataTableRow,
} from 'components/redpanda-ui/components/data-table';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Component } from 'react';

import type { Partition, Topic } from '../../../state/rest-interfaces';
import { ZeroSizeWrapper } from '../../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../../utils/utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { BrokerList } from '../../misc/broker-list';
import { TonedIcon } from '../shared/toned-icon';

const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};

export class SelectPartitionTable extends Component<{
  topic: Topic;
  topicPartitions: Partition[];
  setSelection: (topic: string, partition: number, isSelected: boolean) => void;
  isSelected: (topic: string, partition: number) => boolean;
  getSelectedPartitions: () => number[];
}> {
  private readonly columns: DataTableColumnDef<Partition>[] = [
    {
      id: 'check',
      enableSorting: false,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
      accessorKey: 'id',
    },
    {
      id: 'replicas',
      enableSorting: false,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
      accessorKey: 'replicaSize',
      cell: ({ row: { original: partition } }) => prettyBytesOrNA(partition.replicaSize),
    },
  ];

  render() {
    return (
      <DataTable<Partition>
        columns={this.columns}
        data={this.props.topicPartitions}
        pagination={this.props.topicPartitions.length > DEFAULT_TABLE_PAGE_SIZE}
        sorting
        tableOptions={TABLE_OPTIONS}
      />
    );
  }

  getCheckboxProps = getPartitionCheckboxProps;
}

function renderPartitionError(partition: Partition) {
  const txt = [partition.partitionError, partition.waterMarksError].join('\n\n');

  return (
    <Popover>
      <PopoverTrigger
        delay={200}
        openOnHover
        render={
          <button aria-label="Partition error" type="button">
            <ZeroSizeWrapper alignItems="center" height="18px" justifyContent="center" width="20px">
              <TonedIcon icon={WarningIcon} size={19} tone="warning" />
            </ZeroSizeWrapper>
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto max-w-[500px]" side="right">
        <PopoverTitle>Partition Error</PopoverTitle>
        <div className="whitespace-pre-wrap">{txt}</div>
      </PopoverContent>
    </Popover>
  );
}

function getPartitionCheckboxProps(p: Partition) {
  return { disabled: p.hasErrors };
}
