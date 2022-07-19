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
import { Table } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import { api } from '../../../state/backendApi';
import { makePaginationConfig } from '../../misc/common';
import { Broker } from '../../../state/restInterfaces';
import { transaction } from 'mobx';
import { prettyBytesOrNA } from '../../../utils/utils';
import { SelectionInfoBar } from './components/StatisticsBar';
import { PartitionSelection } from './ReassignPartitions';
import { uiSettings } from '../../../state/ui';


@observer
export class StepSelectBrokers extends Component<{ selectedBrokerIds: number[], partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeBrokers ?? 10);


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

        const columns: ColumnProps<Broker>[] = [
            { title: 'ID', width: 40, dataIndex: 'brokerId' },
            { title: 'Broker Address', width: undefined, dataIndex: 'address' },
            { title: 'Rack', width: undefined, dataIndex: 'rack' },
            { title: 'Used Space', width: 150, dataIndex: 'logDirSize', render: prettyBytesOrNA },
        ];

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Target Brokers</h2>
                <p>Choose the target brokers to move the selected partitions to. Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
            </div>

            <SelectionInfoBar partitionSelection={this.props.partitionSelection} margin="1em" />

            <Table
                style={{ margin: '0', }} size="middle"
                pagination={this.pageConfig}
                onChange={(p) => {
                    if (p.pageSize) uiSettings.reassignment.pageSizeBrokers = p.pageSize;
                    this.pageConfig.current = p.current;
                    this.pageConfig.pageSize = p.pageSize;
                }}

                dataSource={this.brokers}
                columns={columns}

                onRow={record => ({
                    onClick: () => selectedBrokers.includes(record.brokerId)
                        ? selectedBrokers.remove(record.brokerId)
                        : selectedBrokers.push(record.brokerId),
                })}

                rowKey="brokerId"
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    selectedRowKeys: selectedBrokers.slice(),
                    onChange: (keys, values) => {
                        transaction(() => {
                            selectedBrokers.splice(0);
                            for (const broker of values)
                                selectedBrokers.push(broker.brokerId);
                        });
                    },
                }} />
        </>;
    }
}
