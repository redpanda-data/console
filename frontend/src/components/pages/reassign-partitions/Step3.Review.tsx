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


@observer
export class StepReview extends Component<{ partitionSelection: PartitionSelection; brokers: number[]; assignments: PartitionReassignmentRequest; }> {
    pageConfig = makePaginationConfig(15, true);

    render() {
        if (!api.topics)
            return DefaultSkeleton;
        if (api.topicPartitions.size == 0)
            return <Empty />;

        const selectedPartitions = this.selectedPartitions;
        if (selectedPartitions == null)
            return <>selectedPartitions == null</>;

        const columns: ColumnProps<ElementOf<typeof selectedPartitions>>[] = [
            {
                width: undefined, title: 'Topic', dataIndex: 'topicName', defaultSortOrder: 'ascend',
            },
            {
                width: '50%', title: 'Brokers Before',
                render: (v, r) => <BrokerList brokerIds={r.selectedPartitions.flatMap(p => p.replicas)} />
            },
            {
                width: '50%', title: 'Brokers After',
                render: (v, r) => <BrokerList brokerIds={this.props.assignments.topics.first(t => t.topicName == r.topicName)!.partitions.flatMap(p => p.replicas!) ?? []} />
            },
            {
                width: 100, title: (p) => <TextInfoIcon text="Moves" info="The number of replicas that will be moved to a different broker." maxWidth='200px' />,
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

            <ReviewInfoBar partitionSelection={this.props.partitionSelection} partitionsWithMoveInfo={selectedPartitions.flatMap(t => t.selectedPartitions)} />

            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                dataSource={selectedPartitions}
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

    @computed get selectedPartitions(): { topicName: string; topic: Topic; allPartitions: Partition[]; selectedPartitions: (Partition & { movedReplicas: number })[]; }[] {
        const ar = [];
        // For each topic that has partitions selected:
        // - get the partition infos (both selected partitions as well as all partitions)
        // - compute and cache the movement
        for (const [topicName, partitions] of api.topicPartitions) {
            if (partitions == null)
                continue;
            if (this.props.partitionSelection[topicName] == null)
                continue;
            const topic = api.topics?.first(t => t.topicName == topicName);
            if (topic == null)
                continue;

            const selectedPartitions = partitions.filter(p => this.props.partitionSelection[topicName].includes(p.id));
            const partitionsWithTrafficInfo: (Partition & { movedReplicas: number })[] = [];

            // Count how many replicas will be actually moved
            for (const partition of selectedPartitions) {
                // First assume all replicas are moved, then subtract replicas that exist on both old and new brokers
                const oldBrokers = partition.replicas;
                const newAssignments = this.props.assignments.topics.first(t => t.topicName == topicName);
                const newBrokers = newAssignments?.partitions.first(e => e.partitionId == partition.id)?.replicas;
                let moves = 0;
                if (newBrokers) {
                    const intersection = oldBrokers.intersection(newBrokers);
                    moves = oldBrokers.length - intersection.length;
                }
                partitionsWithTrafficInfo.push({ ...partition, movedReplicas: moves });
            }

            ar.push({
                topicName: topicName,
                topic: topic,
                allPartitions: partitions,
                selectedPartitions: partitionsWithTrafficInfo,
            });
        }
        return ar;
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
                    { width: 120, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend' },
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

