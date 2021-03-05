import React, { Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table } from "antd";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Partition, Topic } from "../../../state/restInterfaces";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectionInfoBar } from "./components/StatisticsBars";
import { prettyBytesOrNA } from "../../../utils/utils";
import { ColumnProps } from "antd/lib/table/Column";
import { DefaultSkeleton } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";
import { IReactionDisposer } from "mobx";
import { PartitionSelection } from "./ReassignPartitions";
import Highlighter from 'react-highlight-words';

type TopicWithPartitions = Topic & { partitions: Partition[] };

@observer
export class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(100, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    topicPartitions: TopicWithPartitions[] = [];
    filterQuery: string = "";

    constructor(props: any) {
        super(props);
        this.setSelection = this.setSelection.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
        this.getTopicCheckState = this.getTopicCheckState.bind(this);
    }

    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        this.topicPartitions = api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!
            }
        });

        const columns: ColumnProps<TopicWithPartitions>[] = [
            {
                title: 'Topic', dataIndex: 'topicName', sorter: sortField('topicName'), defaultSortOrder: 'ascend',
                // filtered: true, filteredValue: ['owlshop'], onFilter: (value, record) => record.topicName.toLowerCase().includes(String(value).toLowerCase()),
            },
            { title: 'Partitions', dataIndex: 'partitionCount', sorter: sortField('partitionCount') },
            { title: 'Replicas', dataIndex: 'replicationFactor', sorter: sortField('replicationFactor') },
            {
                title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { title: 'Size', dataIndex: 'logDirSize', render: v => prettyBytesOrNA(v), sorter: sortField('logDirSize') },
        ]

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Select Partitions</h2>
                <p>Choose which partitions you want to reassign to different brokers. Selecting a topic will select all its partitions.</p>
            </div>

            <SelectionInfoBar partitionSelection={this.props.partitionSelection} />

            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                dataSource={this.topicPartitions}
                rowKey={r => r.topicName}
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    columnTitle: <></>, // don't show "select all" checkbox
                    renderCell: (value: boolean, record, index: number, originNode: React.ReactNode) => {
                        return <IndeterminateCheckbox originalCheckbox={originNode} getCheckState={() => this.getTopicCheckState(record.topicName)} />

                    },
                    onSelect: (record, selected: boolean, selectedRows) => {
                        // Select all partitions in this topic
                        if (record.partitions)
                            for (const p of record.partitions)
                                this.setSelection(record.topicName, p.id, selected);
                    },
                    getCheckboxProps: record => {
                        if (record.partitions) {
                            const selectedPartitions = this.props.partitionSelection[record.topicName];
                            let hasPartialSelection = false;
                            if (selectedPartitions && selectedPartitions.length != 0 && selectedPartitions.length < record.partitionCount)
                                hasPartialSelection = true;

                            return { indeterminate: hasPartialSelection };
                        }
                        return {};
                    },
                    // todo: in setSelected() call, keep track of what the 'topic checkbox state' should be (selected, indeterminate)
                    // selectedRowKeys:
                }}
                columns={columns}
                expandable={{
                    expandIconColumnIndex: 1,
                    expandedRowRender: topic => topic.partitions
                        ? <SelectPartitionTable
                            topic={topic}
                            topicPartitions={topic.partitions}
                            isSelected={this.isSelected}
                            setSelection={this.setSelection}
                            getSelectedPartitions={() => this.getSelectedPartitions(topic.topicName)}
                        />
                        : <>Error loading partitions</>,
                    // expandedRowClassName: r => 'noPadding',
                }}
            />
        </>
    }

    setSelection(topic: string, partition: number, isSelected: boolean) {
        const partitions = this.props.partitionSelection[topic] ?? [];

        if (isSelected) {
            partitions.pushDistinct(partition);
        } else {
            partitions.remove(partition);
        }

        if (partitions.length == 0)
            delete this.props.partitionSelection[topic];
        else
            this.props.partitionSelection[topic] = partitions;
    }

    getSelectedPartitions(topic: string) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return [];
        return partitions;
    }

    isSelected(topic: string, partition: number) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return false;
        return partitions.includes(partition);
    }

    getTopicCheckState(topicName: string): { checked: boolean, indeterminate: boolean } {
        const tp = this.topicPartitions.first(t => t.topicName == topicName);
        if (!tp) return { checked: false, indeterminate: false };

        const selected = this.props.partitionSelection[topicName];
        if (!selected) return { checked: false, indeterminate: false };

        if (selected.length == 0)
            return { checked: false, indeterminate: false };

        if (selected.length == tp.partitionCount)
            return { checked: true, indeterminate: false };

        return { checked: false, indeterminate: true };
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
    partitionsPageConfig = makePaginationConfig(100, true);

    render() {
        const brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>These are the brokerIDs this partitions replicas are assigned to.<br />The broker highlighted in blue is currently hosting/handling the leading partition, while the brokers shown in grey are hosting the partitions replicas.</div>;

        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                rowSelection={{
                    type: 'checkbox',
                    columnWidth: '43px',
                    columnTitle: <></>,
                    selectedRowKeys: this.props.getSelectedPartitions().slice(),
                    onSelect: (record, selected: boolean, selectedRows) => {
                        this.props.setSelection(this.props.topic.topicName, record.id, selected);
                    },
                }}
                columns={[
                    { width: 100, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    {
                        width: undefined, title: 'Brokers', render: (v, record) => <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                ]} />
        </div>;
    }
}
