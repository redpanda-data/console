import React from "react";
import { Table, Empty, Skeleton, Row, Statistic, Tag, Input } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { PageComponent, PageInitHelper } from "./Page";
import { GroupMemberDescription, GroupDescription } from "../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";
import { makePaginationConfig, sortField } from "../misc/common";
import { uiSettings } from "../../state/ui";
import { appGlobal } from "../../state/appGlobal";
import { GroupState } from "./GroupDetails";
import { observable } from "mobx";
import { containsIgnoreCase } from "../../utils/utils";

const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

@observer
class GroupList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.consumerGroupList.pageSize);

    initPage(p: PageInitHelper): void {
        p.title = 'Consumer Groups';
        p.addBreadcrumb('Consumer Groups', '/groups');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

    }

    refreshData(force: boolean) {
        api.refreshConsumerGroups(force);
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
                    {stateGroups.map(g => <Statistic key={g.key} title={g.key} value={g.items.length} style={statisticStyle} />)}
                </Row>

                <this.SearchBar />

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
                        {
                            title: 'ID', dataIndex: 'groupId',
                            sorter: sortField('groupId'),
                            filteredValue: [uiSettings.consumerGroupList.quickSearch],
                            onFilter: (filterValue, record: GroupDescription) => (!filterValue) || containsIgnoreCase(record.groupId, filterValue),
                            render: (t, r) => <this.GroupId group={r} />, className: 'whiteSpaceDefault'
                        },
                        { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length, sorter: (a, b) => a.members.length - b.members.length },
                        { title: 'Lag (Sum)', dataIndex: 'lagSum', sorter: (a, b) => a.lagSum - b.lagSum },
                    ]} />
            </motion.div>
        );
    }

    SearchBar = observer(() => {

        return <div style={{ marginBottom: '1em', padding: '0', whiteSpace: 'nowrap' }}>

            <Input allowClear={true} placeholder='Quick Search' size='large' style={{ width: 'auto' }}
                onChange={e => uiSettings.consumerGroupList.quickSearch = e.target.value}
                value={uiSettings.consumerGroupList.quickSearch}
            // addonAfter={
            //     <Popover trigger='click' placement='right' title='Search Settings' content={<this.Settings />}>
            //         <Icon type='setting' style={{ color: '#0006' }} />
            //     </Popover>
            // }
            />

            {/* <this.FilterSummary /> */}
        </div>
    })

    GroupId = (p: { group: GroupDescription }) => {
        const protocol = p.group.protocolType;

        if (protocol == 'consumer') return <>{p.group.groupId}</>;

        return <>
            <Tag>Protocol: {protocol}</Tag>
            <span> {p.group.groupId}</span>
        </>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export default GroupList;
