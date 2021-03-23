import React, { Component } from "react";
import { observer } from "mobx-react";
import { ConfigProvider, Empty, Input, Table, Tooltip } from "antd";
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
import { FilterDropdownProps } from "antd/lib/table/interface";

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

        // (e) => this.inProgress.has(e.topicName) ? 'pureDisplayRow inprogress' :

        const columnsActiveReassignments: ColumnProps<TopicWithPartitions>[] = [
            {
                title: 'Topic',
                render: (v, t) => <><span className='partitionReassignmentSpinner' style={{ marginRight: '4px' }} />{t.topicName}</>,
                sorter: sortField('topicName'), defaultSortOrder: 'ascend',
                onFilter: (value, record) => searchRegexes.any(r => r.test(record.topicName)),
            },
            {
                title: 'Progress', // ProgressBar, Percent, ETA
                render: (v, t) => {
                    const expectedTraffic = new Map<number, number>(); // partition ID -> total expected traffic for this partition
                    const sumSizeOnNewBrokers = new Map<number, number>(); // partition ID -> size (sum) of the partition on the new brokers

                    for (const r of t.activeReassignments) {
                        const partition = t.partitions.first(p => p.id == r.partitionId);
                        const logDirs = partition?.partitionLogDirs.filter(d => !d.error);
                        if (!logDirs) continue;

                        // Actual size of partition, multiplied by how many brokers it needs to be transfered to
                        const actualPartitionSize = logDirs.max(d => d.size);
                        const totalTraffic = actualPartitionSize * r.addingReplicas.length;
                        expectedTraffic.set(r.partitionId, totalTraffic);

                        // Current progress
                        let sizeCurrent = 0;
                        for (const newBrokerId of r.addingReplicas) {
                            const logDirOnNewBroker = logDirs.first(d => d.brokerId == newBrokerId);
                            if (!logDirOnNewBroker) continue;
                            sizeCurrent += logDirOnNewBroker.size;
                        }
                        sumSizeOnNewBrokers.set(r.partitionId, sizeCurrent);
                    }

                    const currentSizeSum = [...sumSizeOnNewBrokers.values()].sum(x => x);
                    const totalExepectedTraffic = [...expectedTraffic.values()].sum(x => x);
                    return <>
                        <span>
                            {prettyBytesOrNA(currentSizeSum)} / {prettyBytesOrNA(totalExepectedTraffic)}
                        </span>
                        <span style={{ marginLeft: '2em' }}>
                            {((currentSizeSum / totalExepectedTraffic) * 100).toFixed(2)} %
                        </span>
                    </>
                }
            },
            {
                title: 'Brokers', // red(old), gray(same), blue(new)
                render: (v, t) => <BrokerList
                    brokerIds={t.activeReassignments.flatMap(r => [...r.replicas, ...r.addingReplicas, ...r.removingReplicas].distinct())}
                    addedIds={t.activeReassignments.flatMap(r => r.addingReplicas).distinct()}
                    removedIds={t.activeReassignments.flatMap(r => r.removingReplicas).distinct()}
                />
            },
            {
                title: 'Moved Size', width: '100px',
                render: (v, t) => prettyBytesOrNA(t.activeReassignments.sum(p => p.addingReplicas.length) * t.logDirSummary.totalSizeBytes)
            },
        ];

        const filterActive = uiSettings.reassignment.quickSearch?.length > 1;
        const searchWords = uiSettings.reassignment.quickSearch?.split(' ') ?? [];
        const searchRegexes = searchWords.map(w => new RegExp(w, 'i'));

        const columns: ColumnProps<TopicWithPartitions>[] = [
            {
                title: 'Topic',
                render: (v, record) => filterActive
                    ? <Highlighter searchWords={searchWords} textToHighlight={record.topicName} />
                    : record.topicName,
                sorter: sortField('topicName'), defaultSortOrder: 'ascend',
                filtered: filterActive, filteredValue: [uiSettings.reassignment.quickSearch],
                onFilter: (value, record) => searchRegexes.any(r => r.test(record.topicName)),
            },
            { title: 'Partitions', dataIndex: 'partitionCount', sorter: sortField('partitionCount') },
            {
                title: 'Replication Factor', render: (t, r) => {
                    if (r.activeReassignments.length == 0) return r.replicationFactor;
                    return <TextInfoIcon text={String(r.replicationFactor)} info="While reassignment is active, replication factor is temporarily doubled." maxWidth="180px" />
                },
                sorter: sortField('replicationFactor')
            },
            {
                title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { title: 'Size', render: (v, r) => prettyBytesOrNA(r.logDirSummary.totalSizeBytes), sorter: (a, b) => a.logDirSummary.totalSizeBytes - b.logDirSummary.totalSizeBytes },
        ];


        return <>
            {/* Active Reassignments */}
            <div style={{ margin: '2em 1em' }}>
                <h3>Active Reassignments</h3>
                <ConfigProvider renderEmpty={() => <div style={{ color: '#00000059', margin: '.4em 0' }}>No reassignments currently in progress</div>}>
                    <Table
                        style={{ margin: '0', }} size={'middle'}

                        dataSource={this.topicPartitionsInProgress}
                        columns={columnsActiveReassignments}

                        rowKey={r => r.topicName}
                        rowClassName={'pureDisplayRow inprogress'}

                        pagination={this.pageConfig}
                        onChange={(p) => {
                            if (p.pageSize) uiSettings.reassignment.pageSizeSelect = p.pageSize;
                            this.pageConfig.current = p.current;
                            this.pageConfig.pageSize = p.pageSize;
                        }}

                    // expandable={{
                    //     expandIconColumnIndex: 1,
                    //     expandedRowRender: topic => <></>,
                    // }}
                    />
                </ConfigProvider>
            </div>

            <div style={{ margin: '1em 1em 2em 1em' }}>

                {/* Title */}
                <h2>Select Partitions</h2>
                <p>Choose which partitions you want to reassign to different brokers. Selecting a topic will select all its partitions.</p>

                {/* Current Selection */}
                <SelectionInfoBar partitionSelection={this.props.partitionSelection} margin="2em 0em .5em 0em" />

                {/* Quicksearch */}
                <div style={{ margin: '0 1px', marginBottom: '1em', display: 'flex', gap: '2.5em', alignItems: 'flex-end' }}>
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
                    showSorterTooltip={false}

                    dataSource={this.topicPartitions}
                    rowKey={r => r.topicName}
                    rowClassName={'pureDisplayRow'}

                    rowSelection={{
                        type: 'checkbox',
                        columnTitle: <div style={{ display: 'flex' }} >
                            <TextInfoIcon text="" info={<>
                                If you want to select multiple items that are adjacent, you can<br />
                                use the SHIFT key. Shift-Click selects the first item, last item and all items in between.
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
            </div>
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
        }).filter(t => t.activeReassignments.length == 0);
    }

    @computed get topicPartitionsInProgress(): TopicWithPartitions[] {
        if (api.topics == null) return [];
        return api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!,
                activeReassignments: this.inProgress.get(topic.topicName) ?? [],
            }
        }).filter(t => t.activeReassignments.length > 0);
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
                    {
                        width: 100, title: 'Size', render: (v, p) => prettyBytesOrNA(p.replicaSize),
                        sortOrder: 'ascend', sorter: (a, b) => a.replicaSize - b.replicaSize
                    },
                ]} />
        </div>;
    }
}
