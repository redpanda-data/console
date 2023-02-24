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

import React, { Component } from 'react';
import { Topic } from '../../../state/restInterfaces';
import {
    Table,
    Skeleton,
    ConfigProvider
} from 'antd';
import { observer } from 'mobx-react';

import '../../../utils/arrayExtensions';

import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';
import { sortField, makePaginationConfig } from '../../misc/common';
import { uiState } from '../../../state/uiState';

@observer
export class TopicConsumers extends Component<{ topic: Topic }> {

    pageConfig = makePaginationConfig(20);

    render() {
        let consumers = api.topicConsumers.get(this.props.topic.topicName);
        const isLoading = consumers == null;
        if (!consumers) consumers = [];

        return <div>
            <ConfigProvider renderEmpty={isLoading ? renderEmpty : undefined}>
                <Table
                    style={{ margin: '0', padding: '0' }} size="middle"
                    showSorterTooltip={false}
                    onRow={(record) =>
                    ({
                        onClick: () => appGlobal.history.push(`/groups/${encodeURIComponent(record.groupId)}`),
                    })}
                    pagination={this.pageConfig}
                    onChange={(pagination) => {
                        if (pagination.pageSize) uiState.topicSettings.consumerPageSize = pagination.pageSize;
                        this.pageConfig.current = pagination.current;
                        this.pageConfig.pageSize = pagination.pageSize;
                    }}
                    rowClassName={() => 'hoverLink'}
                    dataSource={consumers}
                    rowKey={x => x.groupId}
                    columns={[
                        { width: 1, title: 'Group', dataIndex: 'groupId', sorter: sortField('groupId'), defaultSortOrder: 'ascend' },
                        { title: 'Lag', dataIndex: 'summedLag', sorter: sortField('summedLag') },
                    ]} />
            </ConfigProvider>
        </div>
    }
}

const renderEmpty = () => {
    const defaultSkeletonStyle = { margin: '.5em 0' };
    return <div style={defaultSkeletonStyle}>
        <Skeleton loading={true} active={true} paragraph={{ rows: 2, width: '100%' }} />
    </div>
}
