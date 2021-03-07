import React, { Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { api } from "../../../state/backendApi";
import { makePaginationConfig } from "../../misc/common";
import { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from "../../../state/restInterfaces";
import { computed } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { DefaultSkeleton, TextInfoIcon } from "../../../utils/tsxUtils";
import { ElementOf } from "antd/lib/_util/type";
import { ReviewInfoBar, SelectionInfoBar } from "./components/StatisticsBars";
import { BrokerList } from "./components/BrokerList";
import { PartitionSelection, } from "./ReassignPartitions";
import { clone } from "../../../utils/jsonUtils";
import { computeMovedReplicas } from "./logic/utils";

export type PartitionWithMoves = Partition & { movedReplicas: number };
export type TopicWithMoves = { topicName: string; topic: Topic; allPartitions: Partition[]; selectedPartitions: PartitionWithMoves[]; };

@observer
export class StepReview extends Component<{ partitionSelection: PartitionSelection, topicsWithMoves: TopicWithMoves[], assignments: PartitionReassignmentRequest; }> {
    pageConfig = makePaginationConfig(15, true);

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
                width: 100, title: (p) => <TextInfoIcon text="Moves" info="The number of replicas that will be moved to a different broker." maxWidth='180px' />,
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

            <ReviewInfoBar topicsWithMoves={this.props.topicsWithMoves} />

            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
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
        </>;
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

