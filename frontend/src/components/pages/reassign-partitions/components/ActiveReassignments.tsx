import React, { Component } from "react";
import { Tag, Popover, Tooltip, ConfigProvider, Table } from "antd";
import { LazyMap } from "../../../../utils/LazyMap";
import { Broker, Partition, PartitionReassignmentsPartition } from "../../../../state/restInterfaces";
import { api, brokerMap } from "../../../../state/backendApi";
import { computed } from "mobx";
import { findPopupContainer, QuickTable } from "../../../../utils/tsxUtils";
import { makePaginationConfig, sortField } from "../../../misc/common";
import { uiSettings } from "../../../../state/ui";
import { ColumnProps } from "antd/lib/table";
import { TopicWithPartitions } from "../Step1.Partitions";
import { prettyBytesOrNA } from "../../../../utils/utils";
import { BrokerList } from "./BrokerList";


export class ActiveReassignments extends Component {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeActive ?? 10);

    render() {

        const columnsActiveReassignments: ColumnProps<TopicWithPartitions>[] = [
            {
                title: 'Topic',
                render: (v, t) => <><span className='partitionReassignmentSpinner' style={{ marginRight: '4px' }} />{t.topicName}</>,
                sorter: sortField('topicName'), defaultSortOrder: 'ascend',
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


        return <>
            <h3 style={{ marginLeft: '.2em' }}>Current Reassignments</h3>
            <ConfigProvider renderEmpty={() =>
                <div style={{ color: '#00000059', margin: '.4em 0' }}>No reassignments currently in progress</div>
            }>
                <Table
                    style={{ margin: '0', }} size={'middle'}

                    dataSource={this.topicPartitionsInProgress}
                    columns={columnsActiveReassignments}

                    rowKey={r => r.topicName}
                    rowClassName={'pureDisplayRow inprogress'}

                    pagination={this.pageConfig}
                    onChange={(p) => {
                        if (p.pageSize) uiSettings.reassignment.pageSizeActive = p.pageSize;
                        this.pageConfig.current = p.current;
                        this.pageConfig.pageSize = p.pageSize;
                    }}

                // expandable={{
                //     expandIconColumnIndex: 1,
                //     expandedRowRender: topic => <></>,
                // }}
                />
            </ConfigProvider>
        </>
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

    @computed get inProgress(): Map<string, PartitionReassignmentsPartition[]> {
        const current = api.partitionReassignments ?? [];
        return current.toMap(x => x.topicName, x => x.partitions);
    }
}
