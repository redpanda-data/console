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

import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { api } from '../../../state/backendApi';
import { Broker } from '../../../state/restInterfaces';
import { transaction } from 'mobx';
import { eqSet, prettyBytesOrNA } from '../../../utils/utils';
import { SelectionInfoBar } from './components/StatisticsBar';
import { PartitionSelection } from './ReassignPartitions';
import { Checkbox, DataTable } from '@redpanda-data/ui';
import { Row } from '@tanstack/react-table';


@observer
export class StepSelectBrokers extends Component<{ selectedBrokerIds: number[], partitionSelection: PartitionSelection }> {
    brokers: Broker[];

    constructor(props: any) {
        super(props);
        this.brokers = api.clusterInfo!.brokers;
    }

    render() {
        if (!this.brokers || this.brokers.length == 0) {
            console.error('brokers', { brokers: this.brokers, apiClusterInfo: api.clusterInfo });
            return <div>Error: no brokers available</div>;
        }

        const selectedBrokers = this.props.selectedBrokerIds;

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Target Brokers</h2>
                <p>Choose the target brokers to move the selected partitions to. Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
            </div>

            <SelectionInfoBar partitionSelection={this.props.partitionSelection} margin="1em" />

            <DataTable<Broker>
                data={this.brokers}
                showPagination
                columns={[
                    {
                        id: 'check',
                        header: observer(() => {
                            const selectedSet = new Set<number>(selectedBrokers)
                            const allIdsSet = new Set<number>(this.brokers.map(({brokerId}) => brokerId))
                            const allIsSelected = eqSet<number>(selectedSet, allIdsSet)
                            return <Checkbox
                                isIndeterminate={!allIsSelected && selectedSet.size > 0}
                                isChecked={allIsSelected}
                                onChange={() => {
                                    if(!allIsSelected) {
                                        transaction(() => {
                                            selectedBrokers.splice(0);
                                            for (const broker of this.brokers) {
                                                selectedBrokers.push(broker.brokerId);
                                            }
                                        });
                                    } else {
                                        selectedBrokers.splice(0);
                                    }
                                }}
                            />;
                        }),
                        cell: observer(({row: {original: broker}}: { row: Row<Broker> }) => {
                            const checked = selectedBrokers.includes(broker.brokerId)
                            return (
                                <Checkbox
                                    isChecked={checked}
                                    onChange={() => selectedBrokers.includes(broker.brokerId)
                                        ? selectedBrokers.remove(broker.brokerId)
                                        : selectedBrokers.push(broker.brokerId)}
                                />
                            );
                        }),
                    },
                    { header: 'ID', accessorKey: 'brokerId' },
                    { header: 'Broker Address', size: Infinity, accessorKey: 'address' },
                    { header: 'Rack', accessorKey: 'rack' },
                    { header: 'Used Space', accessorKey: 'logDirSize', cell: ({row: {original}}) => prettyBytesOrNA(original.logDirSize) },
                ]}
            />
        </>;
    }
}
