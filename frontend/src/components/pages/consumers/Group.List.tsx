import React from "react";
import { Table, Empty, Skeleton, Row, Statistic, Tag, Input, Divider } from "antd";
import { observer } from "mobx-react";

import { api } from "../../../state/backendApi";
import { PageComponent, PageInitHelper } from "../Page";
import { GroupMemberDescription, GroupDescription } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { makePaginationConfig, sortField } from "../../misc/common";
import { uiSettings } from "../../../state/ui";
import { appGlobal } from "../../../state/appGlobal";
import { GroupState } from "./Group.Details";
import { observable, autorun, IReactionDisposer } from "mobx";
import { containsIgnoreCase } from "../../../utils/utils";
import Card from "../../misc/Card";
import { editQuery } from "../../../utils/queryHelper";
import { uiState } from "../../../state/uiState";
import { DefaultSkeleton } from "../../../utils/tsxUtils";


@observer
class GroupList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.consumerGroupList.pageSize);
    quickSearchReaction: IReactionDisposer;

    initPage(p: PageInitHelper): void {
        p.title = 'Consumer Groups';
        p.addBreadcrumb('Consumer Groups', '/groups');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

    }

    componentDidMount() {
        // 1. use 'q' parameter for quick search (if it exists)
        editQuery(query => {
            if (query["q"])
                uiSettings.consumerGroupList.quickSearch = String(query["q"]);
        });

        // 2. whenever the quick search box changes, update the url
        this.quickSearchReaction = autorun(() => {
            editQuery(query => {
                const q = String(uiSettings.consumerGroupList.quickSearch);
                query["q"] = q ? q : undefined;
            })
        });
    }
    componentWillUnmount() {
        if (this.quickSearchReaction) this.quickSearchReaction();
    }

    refreshData(force: boolean) {
        api.refreshConsumerGroups(force);
    }

    render() {
        if (!api.consumerGroups) return DefaultSkeleton;
        if (api.consumerGroups.size == 0) return <Empty />

        const groups = Array.from(api.consumerGroups.values());
        const stateGroups = groups.groupInto(g => g.state);

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>{/*<Row type="flex">*/}
                        <Statistic title='Total Groups' value={groups.length} />
                        <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />
                        {stateGroups.map(g =>
                            <Statistic style={{ marginRight: '1.5rem' }} key={g.key} title={g.key} value={g.items.length} />
                        )}
                    </Row>
                </Card>

                <Card>
                    <this.SearchBar />

                    <Table
                        style={{ margin: '0', padding: '0' }} size={'middle'}
                        onRow={(record) =>
                        ({
                            onClick: () => appGlobal.history.push('/groups/' + record.groupId),
                        })}
                        pagination={this.pageConfig}
                        onChange={(pagination) => {
                            if (pagination.pageSize) uiSettings.consumerGroupList.pageSize = pagination.pageSize;
                            this.pageConfig.current = pagination.current;
                            this.pageConfig.pageSize = pagination.pageSize;
                        }}
                        rowClassName={() => 'hoverLink'}
                        showSorterTooltip={false}
                        dataSource={groups}
                        rowKey={x => x.groupId}
                        columns={[
                            { title: 'State', dataIndex: 'state', width: '130px', sorter: sortField('state'), render: (t, r) => <GroupState group={r} /> },
                            {
                                title: 'ID', dataIndex: 'groupId',
                                sorter: sortField('groupId'),
                                filteredValue: [uiSettings.consumerGroupList.quickSearch],
                                onFilter: (filterValue, record: GroupDescription) => (!filterValue) || containsIgnoreCase(record.groupId, String(filterValue)),
                                render: (t, r) => <this.GroupId group={r} />, className: 'whiteSpaceDefault'
                            },
                            { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length, sorter: (a, b) => a.members.length - b.members.length },
                            { title: 'Lag (Sum)', dataIndex: 'lagSum', sorter: (a, b) => a.lagSum - b.lagSum },
                        ]} />
                </Card>
            </motion.div>
        </>
    }

    SearchBar = observer(() => {

        return <div style={{ marginBottom: '.5rem', padding: '0', whiteSpace: 'nowrap' }}>

            <Input allowClear={true} placeholder='Quick Search' size='large' style={{ width: '350px' }}
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
}

export default GroupList;
