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

import { Component, ReactNode } from "react";
import React from "react";
import { Partition, Topic, } from "../../../state/restInterfaces";
import { Table, Alert, Tooltip, Popover, } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { sortField, makePaginationConfig } from "../../misc/common";
import { MotionAlways } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { numberToThousandsString, DefaultSkeleton, InfoText, findPopupContainer, LayoutBypass } from "../../../utils/tsxUtils";
import { BrokerList } from "../reassign-partitions/components/BrokerList";
import { WarningTwoTone } from "@ant-design/icons";


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
                {
                    title: 'Partition ID', dataIndex: 'id', sorter: sortField('id'), defaultSortOrder: 'ascend',
                    render: (v, p) => !p.hasErrors
                        ? v
                        : <span style={{ display: 'inline-flex', width: '100%' }}>
                            <span>{v}</span>
                            <span style={{ marginLeft: 'auto', marginRight: '2px', display: 'inline-block' }}>{renderPartitionError(p)}</span>
                        </span>
                },
                {
                    title: <InfoText tooltip="Low Water Mark" tooltipOverText>Low</InfoText>,
                    dataIndex: 'waterMarkLow',
                    render: (value, p) => !p.hasErrors && numberToThousandsString(value),
                    sorter: sortField('waterMarkLow'),
                },
                {
                    title: <InfoText tooltip="High Water Mark" tooltipOverText>High</InfoText>,
                    dataIndex: 'waterMarkHigh',
                    render: (value, p) => !p.hasErrors && numberToThousandsString(value),
                    sorter: sortField('waterMarkHigh')
                },
                {
                    title: 'Messages', key: 'msgCount',
                    render: (_, p) => !p.hasErrors && numberToThousandsString(p.waterMarkHigh - p.waterMarkLow),
                    sorter: (p1, p2) => (p1.waterMarksError || p2.waterMarksError)
                        ? 0
                        : (p1.waterMarkHigh - p1.waterMarkLow) - (p2.waterMarkHigh - p2.waterMarkLow)
                },
                {
                    title: 'Brokers',
                    render: (v, r) => <BrokerList partition={r} />
                }
            ]} />

        return <>
            {warning}
            {table}
        </>
    }
}

function renderPartitionError(partition: Partition) {
    const txt = [partition.partitionError, partition.waterMarksError].join('\n\n');

    return <Popover
        title='Partition Error'
        placement='rightTop' overlayClassName='popoverSmall'
        getPopupContainer={findPopupContainer}
        content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
            {txt}
        </div>
        }
    >
        <span>
            <LayoutBypass justifyContent='center' alignItems='center' width='20px' height='18px'>
                <span style={{ fontSize: '19px' }}>
                    <WarningTwoTone twoToneColor='orange' />
                </span>
            </LayoutBypass>
        </span>
    </Popover>

}
