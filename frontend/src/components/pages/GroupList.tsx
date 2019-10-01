import React from "react";
import { Table, Empty, Skeleton } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { PageComponent, PageInitHelper } from "./Page";
import { GroupMemberDescription } from "../../state/restInterfaces";
import { appGlobal } from "../..";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";
import { makePaginationConfig } from "../common";
import { uiSettings } from "../../state/ui";



@observer
class GroupList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.consumerGroups.pageSize);

    initPage(p: PageInitHelper): void {
        p.title = 'Consumer Groups';
        p.addBreadcrumb('Consumer Groups', '/groups');

        api.refreshConsumerGroups();
    }

    render() {
        if (!api.ConsumerGroups) return this.skeleton;
        if (api.ConsumerGroups.length == 0) return <Empty />

        const groups = api.ConsumerGroups;

        return (
            <motion.div {...animProps}>
                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
                    pagination={this.pageConfig}
                    onRow={(record) =>
                        ({
                            onClick: () => appGlobal.history.push('/groups/' + record.groupId),
                        })}
                    onChange={x => { if (x.pageSize) { uiSettings.consumerGroups.pageSize = x.pageSize } }}
                    rowClassName={() => 'hoverLink'}
                    dataSource={groups}
                    rowKey={x => x.groupId}
                    columns={[
                        { title: 'ID', dataIndex: 'groupId', },
                        { title: 'State', dataIndex: 'state', width: 1 },
                        { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length },
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
