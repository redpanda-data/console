import React, { Component } from "react";
import { observer } from "mobx-react";
import { Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { api } from "../../../state/backendApi";
import { makePaginationConfig } from "../../misc/common";
import { Broker } from "../../../state/restInterfaces";
import { transaction } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { SelectionInfoBar } from "./components/StatisticsBars";
import { PartitionSelection } from "./ReassignPartitions";
import { uiSettings } from "../../../state/ui";


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
            console.log('brokers', { brokers: this.brokers, apiClusterInfo: api.clusterInfo });
            return <div>Error: no brokers available</div>;
        }

        const columns: ColumnProps<Broker>[] = [
            { width: undefined, title: 'Broker Address', dataIndex: 'address' },
            { width: '130px', title: 'Broker ID', dataIndex: 'brokerId' },
            { width: undefined, title: 'Rack', dataIndex: 'rack' },
            { width: '150px', title: 'Used Space', dataIndex: 'logDirSize', render: (value) => prettyBytesOrNA(value) },
        ];

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Target Brokers</h2>
                <p>Choose the target brokers to move the selected partitions to. Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
            </div>

            <SelectionInfoBar partitionSelection={this.props.partitionSelection} />

            <Table
                style={{ margin: '0', }} size='middle'
                pagination={this.pageConfig}
                onChange={(p) => {
                    if (p.pageSize) uiSettings.reassignment.pageSizeBrokers = p.pageSize;
                    this.pageConfig.current = p.current;
                    this.pageConfig.pageSize = p.pageSize;
                }}
                dataSource={this.brokers}
                columns={columns}
                rowKey='brokerId'
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    selectedRowKeys: this.props.selectedBrokerIds.slice(),
                    onChange: (keys, values) => {
                        transaction(() => {
                            this.props.selectedBrokerIds.splice(0);
                            for (const broker of values)
                                this.props.selectedBrokerIds.push(broker.brokerId);
                        });
                    }
                }} />
        </>;
    }
}
