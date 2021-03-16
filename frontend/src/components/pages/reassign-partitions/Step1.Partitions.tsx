import React, { Component } from "react";
import { observer } from "mobx-react";
import { Empty, Input, Table } from "antd";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Partition, PartitionReassignmentsPartition, Topic } from "../../../state/restInterfaces";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectionInfoBar } from "./components/StatisticsBars";
import { prettyBytesOrNA } from "../../../utils/utils";
import { ColumnProps } from "antd/lib/table/Column";
import { DefaultSkeleton, OptionGroup, TextInfoIcon } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";
import { computed, IReactionDisposer, observable, transaction } from "mobx";
import { PartitionSelection } from "./ReassignPartitions";
import Highlighter from 'react-highlight-words';
import { uiSettings } from "../../../state/ui";

type TopicWithPartitions = Topic & { partitions: Partition[], activeReassignments: PartitionReassignmentsPartition[] };

@observer
export class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeSelect ?? 10);
    autorunHandle: IReactionDisposer | undefined = undefined;

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

        const filterActive = uiSettings.reassignment.quickSearch?.length > 1;
        const searchWords = uiSettings.reassignment.quickSearch?.split(' ') ?? [];
        const searchRegexes = searchWords.map(w => new RegExp(w, 'i'));

        const columns: ColumnProps<TopicWithPartitions>[] = [
            {
                title: 'Topic', render: (v, record) => {
                    const txt = filterActive
                        ? <Highlighter searchWords={searchWords} textToHighlight={record.topicName} />
                        : record.topicName;

                    if (record.activeReassignments.length > 0)
                        return <><span className='partitionReassignmentSpinner' />{txt}</>
                    return txt;
                },
                sorter: sortField('topicName'), defaultSortOrder: 'ascend',
                filtered: filterActive, filteredValue: [uiSettings.reassignment.quickSearch],
                onFilter: (value, record) => searchRegexes.any(r => r.test(record.topicName)),
            },
            { title: 'Partitions', dataIndex: 'partitionCount', sorter: sortField('partitionCount') },
            {
                title: 'Replicas', render: (t, r) => {
                    if (r.activeReassignments.length == 0) return r.replicationFactor;
                    return <TextInfoIcon text={String(r.replicationFactor)} info="While reassignment is active, replicas on both source and target brokers are counted" maxWidth="180px" />
                },
                filtered: uiSettings.reassignment.statusFilter != 'all',
                filteredValue: [uiSettings.reassignment.statusFilter ?? 'all'],
                onFilter: (val, record) => {
                    switch (val) {
                        case 'inprogress': return record.activeReassignments.length > 0;
                        case 'notinprogress': return record.activeReassignments.length == 0;
                    }
                    return true;
                },
                sorter: sortField('replicationFactor')
            },
            {
                title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { title: 'Size', render: (v, r) => prettyBytesOrNA(r.logDirSummary.totalSizeBytes), sorter: (a, b) => a.logDirSummary.totalSizeBytes - b.logDirSummary.totalSizeBytes },
        ]

        return <>
            {/* Title */}
            <div style={{ margin: '2em 1em' }}>
                <h2>Select Partitions</h2>
                <p>Choose which partitions you want to reassign to different brokers. Selecting a topic will select all its partitions.</p>
            </div>

            {/* Current Selection */}
            <SelectionInfoBar partitionSelection={this.props.partitionSelection} />

            {/* Quicksearch, Filter */}
            <div style={{ margin: '0 1px', marginTop: '2em', marginBottom: '1em', display: 'flex', gap: '2.5em', alignItems: 'flex-end' }}>
                {/* Status filter */}
                <OptionGroup label='Status'
                    options={{
                        "Show All": 'all',
                        "In Progress": 'inprogress',
                        "Not In Progress": 'notinprogress',
                    }}
                    value={uiSettings.reassignment.statusFilter}
                    onChange={s => uiSettings.reassignment.statusFilter = s}
                />

                {/* Quicksearch */}
                <Input allowClear={true} placeholder='Quick Search' style={{ width: '250px' }}
                    value={uiSettings.reassignment.quickSearch}
                    onChange={x => uiSettings.reassignment.quickSearch = x.target.value}
                />
            </div>

            {/* Topic / Partitions */}
            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                onChange={(p) => {
                    if (p.pageSize) uiSettings.reassignment.pageSizeSelect = p.pageSize;
                    this.pageConfig.current = p.current;
                    this.pageConfig.pageSize = p.pageSize;
                }}

                dataSource={this.topicPartitions}
                rowKey={r => r.topicName}
                rowClassName={(e) => this.inProgress.has(e.topicName) ? 'pureDisplayRow inprogress' : 'pureDisplayRow'}

                rowSelection={{
                    type: 'checkbox',
                    columnTitle: <div style={{ display: 'flex' }} >
                        <TextInfoIcon text="" info={<>
                            Select multiple topics at once by holding down the shift key.<br />
                            Example: Select row 1, then hold down shift while selecting row 5 to select all rows from 1 to 5.
                            </>} maxWidth='360px' iconSize='16px' />
                    </div>,
                    renderCell: (value: boolean, record, index, originNode: React.ReactNode) => {
                        return <IndeterminateCheckbox
                            originalCheckbox={originNode}
                            getCheckState={() => this.getTopicCheckState(record.topicName)}
                        />
                    },
                    onSelect: (record, selected: boolean, selectedRows) => {
                        if (!record.partitions) return;

                        // Select all partitions in this topic
                        transaction(() => {
                            for (const p of record.partitions)
                                this.setSelection(record.topicName, p.id, selected);
                        });
                    },
                    onSelectMultiple: (selected, selectedRows, changeRows) => {
                        transaction(() => {
                            for (const r of changeRows)
                                for (const p of r.partitions)
                                    this.setSelection(r.topicName, p.id, selected);
                        });
                    },
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

    @computed get topicPartitions(): TopicWithPartitions[] {
        if (api.topics == null) return [];
        return api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!,
                activeReassignments: this.inProgress.get(topic.topicName) ?? [],
            }
        });
    }

    @computed get inProgress() {
        const current = api.partitionReassignments ?? [];
        return current.toMap(x => x.topicName, x => x.partitions);
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
