import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Space, Descriptions } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, BrokerConfigEntry, TopicDetail } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed } from "mobx";
import prettyBytes from "pretty-bytes";
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

    @observable filteredBrokers: Broker[];

    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

        this.isMatch = this.isMatch.bind(this);
        this.setResult = this.setResult.bind(this);
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
        if (api.topics)
            for (const topic of api.topics)
                api.refreshTopicPartitions(topic.topicName, force);
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        const topicPartitions: (TopicDetail & {
            partitions: {
                id: number,
                brokerIds: number[],
                size: number,
            }[] | undefined,
            brokersSum: number,
            sizeSum: number,
        })[] = api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)?.map(p => {
                    return {
                        id: p.id,
                        brokerIds: [-1, -2, -3],
                        size: -12345,
                    }
                }),
                brokersSum: -1234567,
                sizeSum: -1234567,
            }
        });

        const columns: ColumnProps<typeof topicPartitions[0]>[] = [
            { width: 'auto', title: 'Topic', dataIndex: 'topicName' },
            { width: 'auto', title: 'Partitions', dataIndex: 'partitionCount' },
            { width: 'auto', title: 'Replication Factor', dataIndex: 'replicationFactor' },
            { width: 'auto', title: 'Brokers', dataIndex: 'brokersSum', render: () => '??' },
            { width: 'auto', title: 'Size', dataIndex: 'logDirSize', render: v => prettyBytes(v) },
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
                        style={{ margin: '0', padding: '0' }} size={'middle'}
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
                            childrenColumnName: 'partitions',
                            // expandedRowRender: topic => <Table
                            //     // size='small'
                            //     dataSource={topic.partitions}
                            //     columns={[
                            //         { dataIndex: 'id', title: 'ID' },
                            //         { dataIndex: 'brokerIds', title: 'Broker IDs' },
                            //         { dataIndex: 'size', title: 'Size' },
                            //     ]}
                            // />,
                            expandedRowClassName: r => 'noPadding',
                        }}
                    />
                </Card>
            </motion.div>
        </>
    }

    isMatch(filter: string, item: Broker) {
        if (item.address.includes(filter)) return true;
        if (item.rack.includes(filter)) return true;

        return false;
    }

    setResult(filteredData: Broker[]) {
        this.filteredBrokers = filteredData;
    }
}

export default ReassignPartitions;
