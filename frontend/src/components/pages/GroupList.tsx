import React from "react";
import { Table, Empty, Skeleton, Row, Statistic } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { PageComponent, PageInitHelper } from "./Page";
import { GroupMemberDescription } from "../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";
import { makePaginationConfig, sortField } from "../misc/common";
import { uiSettings } from "../../state/ui";
import { appGlobal } from "../../state/appGlobal";
import { GroupState } from "./GroupDetails";

const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };


@observer
class GroupList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.consumerGroupList.pageSize);

    initPage(p: PageInitHelper): void {
        p.title = 'Consumer Groups';
        p.addBreadcrumb('Consumer Groups', '/groups');

        api.refreshConsumerGroups();
    }

    render() {
        if (!api.ConsumerGroups) return this.skeleton;
        if (api.ConsumerGroups.length == 0) return <Empty />

        const groups = api.ConsumerGroups;

        const stateGroups = groups.groupInto(g => g.state);

        return (
            <motion.div {...animProps}>
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='Total Groups' value={groups.length} style={statisticStyle} />
                    {stateGroups.map(g => <Statistic title={g.key} value={g.items.length} style={statisticStyle} />)}
                </Row>


                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
                    pagination={this.pageConfig}
                    onRow={(record) =>
                        ({
                            onClick: () => appGlobal.history.push('/groups/' + record.groupId),
                        })}
                    onChange={x => { if (x.pageSize) { uiSettings.consumerGroupList.pageSize = x.pageSize } }}
                    rowClassName={() => 'hoverLink'}
                    dataSource={groups}
                    rowKey={x => x.groupId}
                    columns={[
                        { title: 'State', dataIndex: 'state', width: '130px', sorter: sortField('state'), render: (t, r) => <GroupState group={r} /> },
                        { title: 'ID', dataIndex: 'groupId', sorter: sortField('groupId') },
                        { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length, sorter: (a, b) => a.members.length - b.members.length },
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

export default GroupList;
