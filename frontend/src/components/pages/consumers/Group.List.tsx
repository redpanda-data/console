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

import React from 'react';
import { observer } from 'mobx-react';

import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import { GroupDescription } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { appGlobal } from '../../../state/appGlobal';
import { GroupState } from './Group.Details';
import { autorun, IReactionDisposer } from 'mobx';
import { editQuery } from '../../../utils/queryHelper';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { BrokerList } from '../../misc/BrokerList';
import { ShortNum } from '../../misc/ShortNum';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { DataTable, Flex, SearchField, Tag } from '@redpanda-data/ui';
import { Statistic } from '../../misc/Statistic';
import { Link } from 'react-router-dom';


@observer
class GroupList extends PageComponent {
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
            if (query['q'])
                uiSettings.consumerGroupList.quickSearch = String(query['q']);
        });

        // 2. whenever the quick search box changes, update the url
        this.quickSearchReaction = autorun(() => {
            editQuery(query => {
                const q = String(uiSettings.consumerGroupList.quickSearch);
                if (q) query['q'] = q;
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

        const groups = Array.from(api.consumerGroups.values())
            .filter(groupDescription =>
                groupDescription.groupId.includes(uiSettings.consumerGroupList.quickSearch) ||
                groupDescription.protocol.includes(uiSettings.consumerGroupList.quickSearch)
            );
        const stateGroups = groups.groupInto(g => g.state);

        return (
            <>
                <PageContent>
                    <Section py={4}>
                        <Flex>
                            <Statistic title="Total Groups" value={groups.length} />
                            <div
                                style={{
                                    width: '1px',
                                    background: '#8883',
                                    margin: '0 1.5rem',
                                    marginLeft: 0,
                                }}
                            />
                            {stateGroups.map((g) => (
                                <Statistic
                                    key={g.key}
                                    title={g.key}
                                    value={g.items.length}
                                    marginRight={'1.5rem'}
                                />
                            ))}
                        </Flex>
                    </Section>

                    <Section>
                        {/* Searchbar */} {/* Filters */}
                        <div
                            style={{
                                marginBottom: '.5rem',
                                padding: '0',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2em',
                            }}
                        >
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

                        <DataTable<GroupDescription>
                            data={groups}
                            size="md"
                            columns={[
                                {
                                    header: 'State',
                                    accessorKey: 'state',
                                    size: 130,
                                    cell: ({ row: { original } }) => <GroupState group={original} />,
                                },
                                {
                                    header: 'ID',
                                    accessorKey: 'groupId',
                                    cell: ({ row: { original } }) => <Link to={`/groups/${encodeURIComponent(original.groupId)}`}><this.GroupId group={original} /></Link>,
                                    size: Infinity,
                                },
                                {
                                    header: 'Coordinator',
                                    accessorKey: 'coordinatorId',
                                    size: 1,
                                    cell: ({ row: { original } }) => <BrokerList brokerIds={[original.coordinatorId]} />
                                },
                                {
                                    header: 'Protocol',
                                    accessorKey: 'protocol',
                                    size: 1
                                },
                                {
                                    header: 'Members',
                                    accessorKey: 'members',
                                    size: 1,
                                    cell: ({ row: { original } }) => original.members.length
                                },
                                {
                                    header: 'Lag (Sum)',
                                    accessorKey: 'lagSum',
                                    cell: ({ row: { original } }) => ShortNum({ value: original.lagSum })
                                }
                            ]}
                        />
                    </Section>
                </PageContent>
            </>
        );
    }

    SearchBar = observer(() => {
        return <SearchField width="350px"
            searchText={uiSettings.consumerGroupList.quickSearch}
            setSearchText={x => uiSettings.consumerGroupList.quickSearch = x}
        />
    })

    GroupId = (p: { group: GroupDescription }) => {
        const protocol = p.group.protocolType;

        if (protocol == 'consumer') return <>{p.group.groupId}</>;

        return <Flex alignItems="center" gap={2}>
            <Tag>Protocol: {protocol}</Tag>
            <span>{p.group.groupId}</span>
        </Flex>;
    }
}

export default GroupList;
