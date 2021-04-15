import React, { Component } from "react";
import { observer } from "mobx-react";
import { Button, Empty, Input, Select, Slider, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { api } from "../../../state/backendApi";
import { makePaginationConfig } from "../../misc/common";
import { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from "../../../state/restInterfaces";
import { computed, observable } from "mobx";
import { prettyBytesOrNA, prettyMilliseconds } from "../../../utils/utils";
import { DefaultSkeleton, Label, TextInfoIcon } from "../../../utils/tsxUtils";
import { BrokerList } from "./components/BrokerList";
import ReassignPartitions, { PartitionSelection, } from "./ReassignPartitions";
import { clone } from "../../../utils/jsonUtils";
import { computeMovedReplicas } from "./logic/utils";
import { uiSettings } from "../../../state/ui";
import { IsDev } from "../../../utils/env";

export type PartitionWithMoves = Partition & { movedReplicas: number };
export type TopicWithMoves = { topicName: string; topic: Topic; allPartitions: Partition[]; selectedPartitions: PartitionWithMoves[]; };

@observer
export class StepReview extends Component<{
    partitionSelection: PartitionSelection,
    topicsWithMoves: TopicWithMoves[],
    assignments: PartitionReassignmentRequest,
    reassignPartitions: ReassignPartitions, // since api is still changing, we pass parent down so we can call functions on it directly
}> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeReview, true);

    get requestInProgress() { return this.props.reassignPartitions.requestInProgress; }
    set requestInProgress(v) { this.props.reassignPartitions.requestInProgress = v; }


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
                render: (v, r) => <BrokerList brokerIds={r.selectedPartitions.flatMap(p => p.replicas)} />
            },
            {
                width: '50%', title: 'Brokers After',
                render: (v, r) => <BrokerList brokerIds={this.brokersAfter} />
            },
            {
                width: 100, title: (p) =>
                    <TextInfoIcon
                        text="Reassignments"
                        info="The number of replicas that will be moved to a different broker."
                        maxWidth='180px'
                    />,
                render: (v, r) => r.selectedPartitions.sum(p => p.movedReplicas),
            },
            {
                width: 120, title: 'Estimated Traffic',
                render: (v, r) => prettyBytesOrNA(r.selectedPartitions.sum(p => p.movedReplicas * p.replicaSize)),
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

        return <div style={{ margin: '3em 1em' }}>
            <h2>Bandwidth Throttle</h2>
            <div style={{ color: 'hsl(216deg, 15%, 52%)' }}>
                Using throttling you can limit the network traffic for the reassignment.<br />
                <div style={{ marginTop: '0.5em' }}>
                    <span style={{ fontWeight: 600 }}>Please Note: </span>
                    Throttling applies to all replication traffic, not just during reassignments.
                    Once the reassignment completes you'll have to remove the throttling configuration.
                    You can check for topics that still have a throttle config using the button below 'Current Reassignments' (at the top of the 'Reassign Partitions' page).
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1em', marginTop: '2em', paddingBottom: '1em', alignItems: 'center' }}>

                <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
                    min={2} max={12} step={0.1}
                    marks={{ 2: "Off", 3: "1kB", 6: "1MB", 9: "1GB", 12: "1TB", }}
                    included={true}
                    tipFormatter={f => settings.maxReplicationTraffic < 1000
                        ? 'No limit'
                        : prettyBytesOrNA(settings.maxReplicationTraffic) + '/s'}

                    value={Math.log10(settings.maxReplicationTraffic)}
                    onChange={sv => {
                        const n = Number(sv.valueOf());
                        const newLimit = Math.pow(10, n);
                        if (newLimit >= 1000) {
                            settings.maxReplicationTraffic = newLimit;
                        }
                        else {
                            if (newLimit < 500)
                                settings.maxReplicationTraffic = 0;
                            else settings.maxReplicationTraffic = 1000;
                        }
                    }}
                />

                <Input size='middle' style={{ maxWidth: '180px', display: 'none' }} disabled={this.requestInProgress}
                    value={(settings.maxReplicationTraffic / Math.pow(1000, settings.maxReplicationSizePower)).toFixed(2)}
                    onChange={v => {
                        const val = Number(v.target.value);
                        if (!Number.isFinite(val) || val < 0) return;
                        settings.maxReplicationTraffic = val * Math.pow(1000, settings.maxReplicationSizePower);
                    }}
                    addonAfter={
                        <Select style={{ width: '75px' }} options={[
                            { label: 'B/s', value: 0 }, // value = power
                            { label: 'kB/s', value: 1 },
                            { label: 'MB/s', value: 2 },
                            { label: 'GB/s', value: 3 },
                        ]}
                            value={uiSettings.reassignment.maxReplicationSizePower}
                            onChange={e => uiSettings.reassignment.maxReplicationSizePower = e}
                        />
                    }
                />
            </div>
        </div>
    }

    summary() {
        const settings = uiSettings.reassignment;

        const totalTraffic = this.props.topicsWithMoves.sum(t => t.selectedPartitions.sum(p => p.movedReplicas * p.replicaSize));
        const isThrottled = settings.maxReplicationTraffic > 0;
        const trafficThrottle = isThrottled
            ? prettyBytesOrNA(settings.maxReplicationTraffic) + '/s'
            : 'disabled';

        const estimatedTimeSec = totalTraffic / settings.maxReplicationTraffic;
        const estimatedTime = !isThrottled ? '-'
            : estimatedTimeSec < 10
                ? '< 10 seconds'
                : prettyMilliseconds(estimatedTimeSec * 1000, { secondsDecimalDigits: 0, unitCount: 2, verbose: true })

        const data = [
            { title: 'Moved Replicas', value: this.props.topicsWithMoves.sum(t => t.selectedPartitions.sum(p => p.movedReplicas)) },
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

    @computed get brokersAfter(): number[] {
        const set = new Set<number>();
        for (const t of this.props.assignments.topics)
            for (const p of t.partitions)
                if (p.replicas)
                    for (const id of p.replicas)
                        set.add(id);
        return [...set.values()];
    }

    @computed get totalMovedData(): number {
        return this.props.topicsWithMoves.sum(t => t.selectedPartitions.sum(p => p.movedReplicas * p.replicaSize));
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
                            return <BrokerList brokerIds={partitionAssignments.replicas} />
                        }
                    },
                ]}
            />
        </div>
    }
}

