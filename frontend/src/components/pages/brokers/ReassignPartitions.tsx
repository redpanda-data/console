import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Space, Descriptions } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, BrokerConfigEntry, Partition, TopicDetail } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, OptionGroup } from "../../../utils/tsxUtils";
import { DataValue } from "../topics/Tab.Config";
import { stringify } from "query-string";


interface PartitionReassignment {
    topicPartitions: {
        [topicName: string]: number[] // topicName -> array of partitionIds
    },
    targetBrokers: number[],
}

interface TopicPartitions {
    topicName: string,
    replicationFactor: number,
    partitions: {
        id: number,
        brokerIds: number[],
        size: number,
    }[] | undefined,
    brokersSum: number,
    sizeSum: number,
}

@observer
class ReassignPartitions extends PageComponent {

    pageConfig = makePaginationConfig(100, true);

    @observable partitionSelection: {
        [topicName: string]: number[] // topicName -> array of partitionIds
    } = {};

    autorunHandle: IReactionDisposer | undefined = undefined;

    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        appGlobal.onRefresh = () => this.refreshData(true);

        this.setSelection = this.setSelection.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.getSelectedPartitions = this.getSelectedPartitions.bind(this);

        this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
        if (api.topics)
            for (const topic of api.topics)
                api.refreshTopicPartitions(topic.topicName, force);

        this.autorunHandle = autorun(() => {
            if (api.topics != null)
                for (const topic of api.topics)
                    api.refreshTopicPartitions(topic.topicName, false);
        });
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

        const topicPartitions: (TopicDetail & {
            partitions: Partition[] | null | undefined,
        })[] = api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)
            }
        });

        const columns: ColumnProps<typeof topicPartitions[0]>[] = [
            { width: 'auto', title: 'Topic', dataIndex: 'topicName' },
            { width: 'auto', title: 'Partitions', dataIndex: 'partitionCount' },
            { width: 'auto', title: 'Replication Factor', dataIndex: 'replicationFactor' },
            {
                width: 'auto', title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { width: 'auto', title: 'Size', dataIndex: 'logDirSize', render: v => prettyBytesOrNA(v) },
        ]

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row> {/* type="flex" */}
                        <Statistic title='Total Partitions' value={123} />
                        <Statistic title='Leader Partitions' value={123} />
                        <Statistic title='Replica Partitions' value={123} />
                        <Statistic title='Broker Count' value={123} />
                    </Row>
                </Card>

                <Card>
                    <Table
                        style={{ margin: '0', }} size={'middle'}
                        pagination={this.pageConfig}
                        dataSource={topicPartitions}
                        rowKey={r => r.topicName}
                        rowClassName={() => 'pureDisplayRow'}
                        rowSelection={{
                            type: 'checkbox',
                        }}
                        columns={columns}
                        expandable={{
                            expandIconColumnIndex: 1,
                            expandedRowRender: topic => topic.partitions
                                ? <PartitionTable
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
                </Card>
            </motion.div>
        </>
    }

    setSelection(topic: string, partition: number, isSelected: boolean) {
        const partitions = this.partitionSelection[topic] ?? [];

        if (isSelected) {
            partitions.pushDistinct(partition);
        } else {
            partitions.remove(partition);
        }

        this.partitionSelection[topic] = partitions;
    }

    getSelectedPartitions(topic: string) {
        const partitions = this.partitionSelection[topic];
        if (!partitions) return [];
        return partitions;
    }

    isSelected(topic: string, partition: number) {
        const partitions = this.partitionSelection[topic];
        if (!partitions) return false;
        return partitions.includes(partition);
    }

}

@observer
class PartitionTable extends Component<{
    topic: TopicDetail,
    topicPartitions: Partition[],
    setSelection: (topic: string, partition: number, isSelected: boolean) => void,
    isSelected: (topic: string, partition: number) => boolean,
    getSelectedPartitions: () => number[]
}> {
    partitionsPageConfig = makePaginationConfig(100, true);

    render() {
        return <div style={{ paddingTop: '4px', paddingBottom: '8px' }}>
            <Table size='small'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                rowSelection={{
                    type: 'checkbox',
                    columnWidth: '43px',
                    columnTitle: <></>, // don't show "select all" checkbox
                    // onChange: (selected) => console.log('onChange selected=', selected),
                    selectedRowKeys: this.props.getSelectedPartitions().slice(),
                    onSelect: (record, selected: boolean, selectedRows) => {
                        this.props.setSelection(this.props.topic.topicName, record.id, selected);
                        console.log("SetSelection, now selected: ", this.props.getSelectedPartitions());
                    },
                }}
                columns={[
                    { width: 100, title: 'ID', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    { width: 160, title: 'Leading Broker', dataIndex: 'leader' },
                    { width: undefined, title: 'Brokers', render: (v, record,) => record.replicas.slice().sort((a, b) => a - b).join(", ") },
                ]}
            />
        </div>
    }
}

export default ReassignPartitions;
