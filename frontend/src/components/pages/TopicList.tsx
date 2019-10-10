import React from "react";
import { Table, Empty, Skeleton, Checkbox, Row, Statistic } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { uiSettings } from "../../state/ui";
import { PageComponent, PageInitHelper } from "./Page";
import { CompareFn } from "antd/lib/table";
import { PaginationConfig } from "antd/lib/pagination";
import { NavLink } from "react-router-dom";
import { makePaginationConfig, sortField } from "../misc/common";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";
import { appGlobal } from "../../state/appGlobal";

const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

@observer
class TopicList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.topicList.pageSize);

    initPage(p: PageInitHelper): void {
        p.title = 'Topics';
        p.addBreadcrumb('Topics', '/topics');
        p.extraContent = () => <>
            <Checkbox
                checked={uiSettings.topicList.hideInternalTopics}
                onChange={e => uiSettings.topicList.hideInternalTopics = e.target.checked}
            >Hide internal topics</Checkbox>
        </>

        api.refreshTopics();
    }

    render() {
        if (!api.Topics) return this.skeleton;
        if (api.Topics.length == 0) return <Empty />

        const topics = api.Topics.filter(t => uiSettings.topicList.hideInternalTopics && t.isInternal ? false : true);

        return (
            <motion.div {...animProps}>
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='Total Topics' value={topics.length} style={statisticStyle} />
                    <Statistic title='Total Partitions' value={topics.map(x => x.partitionCount).reduce((p, c) => p + c)} style={statisticStyle} />
                </Row>

                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
                    onRow={(record, rowIndex) =>
                        ({
                            onClick: event => appGlobal.history.push('/topics/' + record.topicName),
                        })}
                    onChange={x => { if (x.pageSize) { uiSettings.topicList.pageSize = x.pageSize } }}
                    rowClassName={() => 'hoverLink'}
                    pagination={this.pageConfig}
                    dataSource={topics}
                    rowKey={x => x.topicName}
                    columns={[
                        { title: 'Name', dataIndex: 'topicName', sorter: sortField('topicName') },
                        { title: 'Partitions', dataIndex: 'partitions', render: (t, r) => r.partitionCount, sorter: (a, b) => a.partitionCount - b.partitionCount, width: 1 },
                        { title: 'Replication', dataIndex: 'replicationFactor', width: 1 },
                        { title: 'CleanupPolicy', dataIndex: 'cleanupPolicy', width: 1 },
                    ]} />
            </motion.div>
        );
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export default TopicList;
