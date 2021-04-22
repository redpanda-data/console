import { Component, ReactNode } from "react";
import React from "react";
import { Topic, } from "../../../state/restInterfaces";
import { Table, Alert, } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { sortField, makePaginationConfig } from "../../misc/common";
import { MotionAlways } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { numberToThousandsString, DefaultSkeleton, InfoText } from "../../../utils/tsxUtils";
import { BrokerList } from "../reassign-partitions/components/BrokerList";


@observer
export class TopicPartitions extends Component<{ topic: Topic }> {

    pageConfig = makePaginationConfig(100); // makePaginationConfig(uiSettings.topics.partitionPageSize);

    render() {
        const topic = this.props.topic;
        let partitions = api.topicPartitions.get(topic.topicName);
        if (partitions === undefined) return DefaultSkeleton;
        if (partitions === null) partitions = []; // todo: show the error (if one was reported);

        let warning: JSX.Element = <></>
        if (topic.cleanupPolicy.toLowerCase() == 'compact')
            warning = <Alert type="warning" message="Topic cleanupPolicy is 'compact'. Message Count is an estimate!" showIcon style={{ marginBottom: '1em' }} />

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            showSorterTooltip={false}
            pagination={this.pageConfig}
            onChange={(pagination) => {
                if (pagination.pageSize) uiState.topicSettings.partitionPageSize = pagination.pageSize;
                this.pageConfig.current = pagination.current;
                this.pageConfig.pageSize = pagination.pageSize;
            }}
            dataSource={partitions}
            rowKey={x => x.id.toString()}
            columns={[
                { title: 'Partition ID', dataIndex: 'id', sorter: sortField('id'), defaultSortOrder: 'ascend' },
                {
                    title: <InfoText tooltip="Low Water Mark" tooltipOverText>Low</InfoText>,
                    dataIndex: 'waterMarkLow', render: (t) => numberToThousandsString(t), sorter: sortField('waterMarkLow')
                },
                {
                    title: <InfoText tooltip="High Water Mark" tooltipOverText>High</InfoText>,
                    dataIndex: 'waterMarkHigh', render: (t) => numberToThousandsString(t), sorter: sortField('waterMarkHigh')
                },
                {
                    title: 'Messages', key: 'msgCount', render: (t, r) => numberToThousandsString(r.waterMarkHigh - r.waterMarkLow),
                    sorter: (p1, p2) => (p1.waterMarkHigh - p1.waterMarkLow) - (p2.waterMarkHigh - p2.waterMarkLow)
                },
                { title: 'Brokers', render: (v, r) => <BrokerList brokerIds={r.replicas} /> }
            ]} />

        return <MotionAlways>
            {warning}
            {table}
        </MotionAlways>
    }
}
