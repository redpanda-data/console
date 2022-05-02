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

import React from "react";
import { Table, Empty, Skeleton, Row, Statistic, Tag, Input, Divider, Checkbox } from "antd";
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
import { DefaultSkeleton, Label, OptionGroup } from "../../../utils/tsxUtils";
import { BrokerList } from "../reassign-partitions/components/BrokerList";
import { ShortNum } from "../../misc/ShortNum";
import { KowlTable } from "../../misc/KowlTable";


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
                if (q) query["q"] = q;
            });
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

        const groups = Array.from(api.consumerGroups.values());
        const stateGroups = groups.groupInto(g => g.state);
        const tableSettings = uiSettings.consumerGroupList ?? {};

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>
                        <Statistic title='Total Groups' value={groups.length} />
                        <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />
                        {stateGroups.map(g =>
                            <Statistic style={{ marginRight: '1.5rem' }} key={g.key} title={g.key} value={g.items.length} />
                        )}
                    </Row>
                </Card>

                <Card>
                    {/* Searchbar */} {/* Filters */}
                    <div style={{ marginBottom: '.5rem', padding: '0', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '2em' }}>
                        <this.SearchBar />
                        {/*
                        <Checkbox
                            value={uiSettings.consumerGroupList.hideEmpty}
                            onChange={c => uiSettings.consumerGroupList.hideEmpty = c.target.checked}
                        >
                            Hide Empty
                        </Checkbox>
                        */}
                    </div>

                    {/* Content */}
                    <KowlTable
                        dataSource={groups}
                        columns={[
                            {
                                title: 'State', dataIndex: 'state', width: '130px', sorter: sortField('state'), render: (t, r) => <GroupState group={r} />,
                                filterType: { type: 'enum', }
                            },
                            {
                                title: 'ID', dataIndex: 'groupId',
                                sorter: sortField('groupId'),
                                filteredValue: [tableSettings.quickSearch],
                                onFilter: (filterValue, record: GroupDescription) => (!filterValue) || containsIgnoreCase(record.groupId, String(filterValue)),
                                render: (t, r) => <this.GroupId group={r} />, className: 'whiteSpaceDefault'
                            },
                            { title: 'Coordinator', dataIndex: 'coordinatorId', width: 1, render: (x: number) => <BrokerList brokerIds={[x]} /> },
                            { title: 'Protocol', dataIndex: 'protocol', width: 1 },
                            { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length, sorter: (a, b) => a.members.length - b.members.length, defaultSortOrder: 'descend' },
                            { title: 'Lag (Sum)', dataIndex: 'lagSum', render: v => ShortNum({ value: v }), sorter: (a, b) => a.lagSum - b.lagSum },
                        ]}

                        observableSettings={tableSettings}

                        rowKey={x => x.groupId}
                        rowClassName="hoverLink"
                        onRow={(record) =>
                        ({
                            onClick: () => appGlobal.history.push('/groups/' + record.groupId),
                        })}
                    />
                </Card>
            </motion.div>
        </>;
    }

    SearchBar = observer(() => {
        return <Input allowClear={true} placeholder='Quick Search' size='large' style={{ width: '350px' }}
            onChange={e => uiSettings.consumerGroupList.quickSearch = e.target.value}
            value={uiSettings.consumerGroupList.quickSearch}
        />
    })

    GroupId = (p: { group: GroupDescription }) => {
        const protocol = p.group.protocolType;

        if (protocol == 'consumer') return <>{p.group.groupId}</>;

        return <>
            <Tag>Protocol: {protocol}</Tag>
            <span> {p.group.groupId}</span>
        </>;
    }
}

export default GroupList;
