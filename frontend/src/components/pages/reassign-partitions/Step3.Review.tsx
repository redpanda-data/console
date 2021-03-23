import React, { Component } from "react";
import { observer } from "mobx-react";
import { Button, Checkbox, Empty, Input, InputNumber, Select, Slider, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { api } from "../../../state/backendApi";
import { makePaginationConfig } from "../../misc/common";
import { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from "../../../state/restInterfaces";
import { computed, observable } from "mobx";
import { prettyBytesOrNA, prettyMilliseconds } from "../../../utils/utils";
import { DefaultSkeleton, Label, TextInfoIcon } from "../../../utils/tsxUtils";
import { ElementOf } from "antd/lib/_util/type";
import { ReviewInfoBar, SelectionInfoBar } from "./components/StatisticsBars";
import { BrokerList } from "./components/BrokerList";
import ReassignPartitions, { PartitionSelection, } from "./ReassignPartitions";
import { clone } from "../../../utils/jsonUtils";
import { computeMovedReplicas } from "./logic/utils";
import { uiSettings } from "../../../state/ui";

export type PartitionWithMoves = Partition & { movedReplicas: number };
export type TopicWithMoves = { topicName: string; topic: Topic; allPartitions: Partition[]; selectedPartitions: PartitionWithMoves[]; };

@observer
export class StepReview extends Component<{
    partitionSelection: PartitionSelection,
    topicsWithMoves: TopicWithMoves[],
    assignments: PartitionReassignmentRequest,
    reassignPartitions: ReassignPartitions, // since api is still changing, we pass parent down so we can call functions on it directly
}> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeReview ?? 10);

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
                <h2>Review</h2>
                <p>Review the plan Kowl computed to distribute the selected partitions onto the selected brokers.</p>
            </div>

            <SelectionInfoBar partitionSelection={this.props.partitionSelection} />

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
                }} />

            <ReviewInfoBar topicsWithMoves={this.props.topicsWithMoves} />

            {this.renderReassignmentOptions()}
        </>;
    }
    renderReassignmentOptions() {
        const settings = uiSettings.reassignment;
        const setLimits = settings.limitReplicationTraffic;

        const showTimeEstimate = setLimits && settings.maxReplicationTraffic > 0;
        const estimatedTime = showTimeEstimate
            ? (this.totalMovedData / settings.maxReplicationTraffic) * 1000
            : 0;


        return <div>
            <div style={{ display: 'flex', gap: '1em', marginTop: '2em', alignItems: 'center' }}>
                <Label text="Maximum replication traffic">
                    <>
                        <Slider min={2} max={12} style={{ width: '300px', margin: '0 10px' }}
                            marks={{
                                2: "Off",
                                3: "1kB",
                                6: "1MB",
                                9: "1GB",
                                12: "1TB",
                            }}
                            step={0.01}
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
                    </>

                </Label>


                <Input size='middle' style={{ maxWidth: '180px' }} disabled={!setLimits || this.requestInProgress}
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
                {showTimeEstimate && <span>
                    {prettyMilliseconds(estimatedTime)}
                </span>}

                <Button danger loading={this.requestInProgress}
                    disabled={this.requestInProgress}
                    onClick={async () => {
                        this.requestInProgress = true;
                        try {
                            const rq = this.props.reassignPartitions.reassignmentRequest;
                            if (rq)
                                await this.props.reassignPartitions.setTrafficLimit(rq, false, false);
                        } finally { this.requestInProgress = false; }
                    }}>Set throttle config</Button>

                <Button danger loading={this.requestInProgress}
                    disabled={this.requestInProgress}
                    onClick={async () => {
                        this.requestInProgress = true;
                        try {
                            const rq = this.props.reassignPartitions.reassignmentRequest;
                            if (rq)
                                await this.props.reassignPartitions.resetTrafficLimit(rq, false);
                        } finally { this.requestInProgress = false; }
                    }}>Reset throttle config</Button>

            </div>
            {/* todo: warning that the user will have to reset/remove this config manually after the reassignment is done */}
        </div>
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

