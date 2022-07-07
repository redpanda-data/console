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

import { Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { api } from "../../../state/backendApi";
import { makePaginationConfig } from "../../misc/common";
import { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from "../../../state/restInterfaces";
import { makeObservable, observable } from "mobx";
import { prettyBytesOrNA, prettyMilliseconds } from "../../../utils/utils";
import { DefaultSkeleton, InfoText } from "../../../utils/tsxUtils";
import { BrokerList } from "../../misc/BrokerList";
import ReassignPartitions, { PartitionSelection, } from "./ReassignPartitions";
import { uiSettings } from "../../../state/ui";
import { BandwidthSlider } from "./components/BandwidthSlider";

export type PartitionWithMoves = Partition & {
    brokersBefore: number[],
    brokersAfter: number[],
    // numAddedBrokers = number of brokers that are "new" to the partition
    // So only *new* brokers, not counting brokers that have previously (and maybe still are) hosted a replica of the partition
    numAddedBrokers: number,
    numRemovedBrokers: number,
    changedLeader: boolean,
    anyChanges: boolean, // if false, replica assignment is exactly as before
};
export type TopicWithMoves = { topicName: string; topic: Topic; allPartitions: Partition[]; selectedPartitions: PartitionWithMoves[]; };

@observer
export class StepReview extends Component<{
    partitionSelection: PartitionSelection,
    topicsWithMoves: TopicWithMoves[],
    assignments: PartitionReassignmentRequest,
    reassignPartitions: ReassignPartitions, // since api is still changing, we pass parent down so we can call functions on it directly
}> {
    @observable unused: number = 0;

    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeReview, true);

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.topics)
            return DefaultSkeleton;
        if (api.topicPartitions.size == 0)
            return <Empty />;


        const columns: ColumnProps<TopicWithMoves>[] = [
            {
                width: undefined, title: 'Topic', dataIndex: 'topicName', defaultSortOrder: 'ascend',
            },
            {
                width: '50%', title: 'Brokers Before',
                render: (v, r) => {
                    const brokersBefore = r.selectedPartitions.flatMap(x => x.brokersBefore).distinct().sort((a, b) => a - b);
                    return <BrokerList brokerIds={brokersBefore} />
                }
            },
            {
                width: '50%', title: 'Brokers After',
                render: (v, r) => {
                    const plannedBrokers = r.selectedPartitions.flatMap(x => x.brokersAfter).distinct().sort((a, b) => a - b);
                    return <BrokerList brokerIds={plannedBrokers} />
                }
            },
            {
                width: 100, title: (p) =>
                    <InfoText
                        tooltip="The number of replicas that will be moved to a different broker."
                        maxWidth='180px'
                    >Reassignments</InfoText>,
                render: (v, r) => r.selectedPartitions.sum(p => p.numAddedBrokers),
            },
            {
                width: 120, title: 'Estimated Traffic',
                render: (v, r) => prettyBytesOrNA(r.selectedPartitions.sum(p => p.numAddedBrokers * p.replicaSize)),
            },
        ];

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Review Reassignment Plan</h2>
                <p>Kowl computed the following reassignment plan to distribute the selected partitions onto the selected brokers.</p>
            </div>

            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                onChange={(p) => {
                    if (p.pageSize) uiSettings.reassignment.pageSizeReview = p.pageSize;
                    this.pageConfig.current = p.current;
                    this.pageConfig.pageSize = p.pageSize;
                }}
                dataSource={this.props.topicsWithMoves}
                rowKey={r => r.topicName}
                rowClassName={() => 'pureDisplayRow'}
                columns={columns}
                expandable={{
                    expandIconColumnIndex: 0,
                    expandRowByClick: true,
                    expandedRowRender: topic => topic.selectedPartitions
                        ? <ReviewPartitionTable
                            topic={topic.topic}
                            topicPartitions={topic.selectedPartitions}
                            assignments={this.props.assignments.topics.first(t => t.topicName == topic.topicName)!} />
                        : <>Error loading partitions</>,
                }}
            />

            {this.reassignmentOptions()}

            {this.summary()}
        </>;
    }

    reassignmentOptions() {
        const settings = uiSettings.reassignment;

        return <div style={{ margin: '4em 1em 3em 1em' }}>
            <h2>Bandwidth Throttle</h2>
            <p>Using throttling you can limit the network traffic for reassignments.</p>

            <div style={{ marginTop: '2em', paddingBottom: '1em' }}>
                <BandwidthSlider settings={settings} />
            </div>

            <ul style={{ marginTop: '0.5em' }}>
                <li>Throttling applies to all replication traffic, not just to active reassignments.</li>
                <li>Once the reassignment completes you'll have to remove the throttling configuration. <br />
                    Kowl will show a warning below the "Current Reassignments" table when there are throttled topics that are no longer being reassigned.
                </li>
            </ul>
        </div>
    }

    summary() {
        const settings = uiSettings.reassignment;
        const maxReplicationTraffic = settings.maxReplicationTraffic ?? 0;

        const trafficStats = this.props.topicsWithMoves.map(t => {
            const partitionStats = t.selectedPartitions.map(p => {
                const totalTraffic = p.replicaSize * p.numAddedBrokers;

                if (totalTraffic == 0) {
                    // Moving zero replicas or replicas with zero size won't take any time
                    return {
                        ...p,
                        totalTraffic: 0,
                        potentialBandwidth: 0,
                        estimatedTimeSec: 0,
                    };
                }

                // if there are 2 senders and 2 receivers, the bandwidth limit is effectively double
                // but for (1sender and 2receivers), or (2senders and 1receiver) it won't go any faster.
                const senders = p.brokersBefore.except(p.brokersAfter);
                const receivers = p.brokersAfter.except(p.brokersBefore);

                const participatingTransferPairs = Math.min(senders.length, receivers.length);
                const potentialBandwidth = participatingTransferPairs * maxReplicationTraffic;

                let estimatedTimeSec = totalTraffic / potentialBandwidth;
                if (estimatedTimeSec <= 0 || !Number.isFinite(estimatedTimeSec)) {
                    estimatedTimeSec = 0;
                }

                return {
                    ...p,
                    totalTraffic: totalTraffic,
                    potentialBandwidth: potentialBandwidth,
                    estimatedTimeSec: estimatedTimeSec,
                }
            });

            return {
                ...t,
                partitionStats: partitionStats,
            }
        });
        const estimatedTimeSec = trafficStats.sum(t => t.partitionStats.sum(p => p.estimatedTimeSec));

        const totalTraffic = trafficStats.sum(t => t.partitionStats.sum(p => p.totalTraffic));

        const isThrottled = settings.maxReplicationTraffic != null && settings.maxReplicationTraffic > 0;
        const trafficThrottle = isThrottled
            ? prettyBytesOrNA(settings.maxReplicationTraffic ?? 0) + '/s'
            : 'disabled';

        const estimatedTime = !isThrottled ? '-'
            : estimatedTimeSec < 10
                ? '< 10 seconds'
                : prettyMilliseconds(estimatedTimeSec * 1000, { secondsDecimalDigits: 0, unitCount: 2, verbose: true })

        const data = [
            { title: 'Moved Replicas', value: this.props.topicsWithMoves.sum(t => t.selectedPartitions.sum(p => p.numAddedBrokers)) },
            { title: 'Total Traffic', value: "~" + prettyBytesOrNA(totalTraffic) },
            { title: 'Traffic Throttle', value: trafficThrottle },
            { title: 'Estimated Time', value: estimatedTime },
        ];

        return <div style={{ margin: '2em 1em 5em 1em' }}>
            <h2>Summary</h2>
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '3em',
                marginTop: '1em',
                color: 'hsl(0deg, 0%, 30%)'
            }}>
                {data.map(item => <div key={item.title}>
                    <div style={{ opacity: 0.6, }}>{item.title}</div>
                    <div style={{ fontSize: 'calc(1em * 24 / 14)', }}>{item.value}</div>
                </div>)}
            </div>
        </div>;
    }
}


@observer
class ReviewPartitionTable extends Component<{ topic: Topic, topicPartitions: Partition[], assignments: TopicAssignment }> {
    partitionsPageConfig = makePaginationConfig(100, true);
    brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>
        These are the brokers this partitions replicas are assigned to.<br />
        The broker highlighted in blue is currently hosting/handling the leading partition, while the brokers shown in grey are hosting the partitions replicas.
    </div>;

    render() {

        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                columns={[
                    { width: 120, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    {
                        width: undefined, title: 'Brokers Before',
                        render: (v, record) => <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                    {
                        width: undefined, title: 'Brokers After',
                        render: (v, record) => {
                            const partitionAssignments = this.props.assignments.partitions.first(p => p.partitionId == record.id);
                            if (partitionAssignments == null || partitionAssignments.replicas == null) return '??';
                            return <BrokerList brokerIds={partitionAssignments.replicas} leaderId={partitionAssignments.replicas[0]} />
                        }
                    },
                ]}
            />
        </div>
    }
}

