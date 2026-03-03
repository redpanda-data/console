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

import { Checkbox, DataTable } from '@redpanda-data/ui';
import type { Row } from '@tanstack/react-table';
import { Component } from 'react';

import { SelectionInfoBar } from './components/statistics-bar';
import type { PartitionSelection } from './reassign-partitions';
import { api } from '../../../state/backend-api';
import type { Broker } from '../../../state/rest-interfaces';
import { eqSet, prettyBytesOrNA } from '../../../utils/utils';

export class StepSelectBrokers extends Component<{
  selectedBrokerIds: number[];
  onSelectionChange: (newIds: number[]) => void;
  partitionSelection: PartitionSelection;
}> {
  brokers: Broker[];

  constructor(props: {
    selectedBrokerIds: number[];
    onSelectionChange: (newIds: number[]) => void;
    partitionSelection: PartitionSelection;
  }) {
    super(props);
    this.brokers = api.clusterInfo?.brokers ?? [];
  }

  render() {
    if (!this.brokers || this.brokers.length === 0) {
      return <div>Error: no brokers available</div>;
    }

    const { selectedBrokerIds, onSelectionChange } = this.props;

    return (
      <>
        <div style={{ margin: '2em 1em' }}>
          <h2>Target Brokers</h2>
          <p>
            Choose the target brokers to move the selected partitions to. Redpanda Console will distribute partitions
            across the available racks of the selected target brokers.
          </p>
        </div>

        <SelectionInfoBar margin="1em" partitionSelection={this.props.partitionSelection} />

        <DataTable<Broker>
          columns={[
            {
              id: 'check',
              header: () => {
                const selectedSet = new Set<number>(selectedBrokerIds);
                const allIdsSet = new Set<number>(this.brokers.map(({ brokerId }) => brokerId));
                const allIsSelected = eqSet<number>(selectedSet, allIdsSet);
                return (
                  <Checkbox
                    isChecked={allIsSelected}
                    isIndeterminate={!allIsSelected && selectedSet.size > 0}
                    onChange={() => {
                      if (allIsSelected) {
                        onSelectionChange([]);
                      } else {
                        onSelectionChange(this.brokers.map((b) => b.brokerId));
                      }
                    }}
                  />
                );
              },
              cell: ({ row: { original: broker } }: { row: Row<Broker> }) => {
                const checked = selectedBrokerIds.includes(broker.brokerId);
                return (
                  <Checkbox
                    isChecked={checked}
                    onChange={() => {
                      if (checked) {
                        onSelectionChange(selectedBrokerIds.filter((id) => id !== broker.brokerId));
                      } else {
                        onSelectionChange([...selectedBrokerIds, broker.brokerId]);
                      }
                    }}
                  />
                );
              },
            },
            { header: 'ID', accessorKey: 'brokerId' },
            { header: 'Broker Address', size: Number.POSITIVE_INFINITY, accessorKey: 'address' },
            { header: 'Rack', accessorKey: 'rack' },
            {
              header: 'Used Space',
              accessorKey: 'logDirSize',
              cell: ({ row: { original } }) => prettyBytesOrNA(original.logDirSize),
            },
          ]}
          data={this.brokers}
          pagination={true}
        />
      </>
    );
  }
}
