import { observable, makeObservable } from 'mobx';
import { observer } from 'mobx-react';
import { RefObject } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import SearchBar from '../../misc/SearchBar';
import { PageComponent, PageInitHelper } from '../Page';
import React from 'react';
import { api } from '../../../state/backendApi';
import { Flex, Divider } from '@chakra-ui/react';
import { InlineSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { SmallStat } from '../../misc/SmallStat';
import { DataTable, SearchField, Icon, Text, Tooltip } from '@redpanda-data/ui';
import { uiSettings } from '../../../state/ui';
import { GroupDescription } from '../../../state/restInterfaces';
import { BrokerList } from '../../misc/BrokerList';
import { ShortNum } from '../../misc/ShortNum';
import { Link } from 'react-router-dom';
import { MdCheck, MdHeartBroken, MdHourglassBottom, MdOutlineBalance, MdOutlineBlock, MdQuiz } from 'react-icons/md';
import { IconType } from 'react-icons';

interface GroupStateProps {
    text: string;
    icon: IconType;
    description: string;
    color: string;
}

@observer
class ConsumerGroupList extends PageComponent<{}> {
    @observable searchBar: RefObject<SearchBar<any>> = React.createRef();
    @observable filteredSchemaSubjects: { name: string }[];
    @observable isLoadingSchemaVersionMatches = false;
    @observable isHelpSidebarOpen = false;
    stateIcons = new Map<string, JSX.Element>([
        ['stable', <MdCheck key="stable" color="green" />],
        ['completingrebalance', <MdCheck key="completingrebalance" />],
        ['preparingrebalance', <MdCheck key="preparingrebalance" />],
        ['empty', <MdCheck key="empty" />],
        ['dead', <MdCheck key="dead" />],
        ['unknown', <MdCheck key="unknown" />],
    ]);

    stateProps = new Map<string, GroupStateProps>([
        [
            'stable',
            {
                text: 'Stable',
                icon: MdCheck,
                description: 'The group has completed rebalancing and all consumers are assigned partitions.',
                color: 'green',
            }
        ],
        [
            'completingrebalance',
            {
                text: 'Completing Rebalance',
                icon: MdHourglassBottom,
                description: 'The group is finishing up a rebalance, and members are receiving their new assignments.',
                color: 'grey',
            }
        ],
        [
            'preparingrebalance',
            {
                text: 'Preparing Rebalance',
                icon: MdOutlineBalance,
                description: 'The group is preparing to rebalance. Kafka is deciding on the new assignment of partitions to consumers.',
                color: 'grey',
            }
        ],
        [
            'empty',
            {
                text: 'Empty',
                icon: MdOutlineBlock,
                description: 'The group has no active consumers, but it may still exist and can be joined.',
                color: 'grey',
            }
        ],
        [
            'dead',
            {
                text: 'Dead',
                icon: MdHeartBroken,
                description: 'The consumer group is not active. This could mean that all its consumers have left, or the group has been deleted.',
                color: 'grey',
            }
        ],
        [
            'unknown',
            {
                text: 'Unknown',
                icon: MdQuiz,
                description: 'This state indicates that the state of the consumer group could not be determined.',
                color: 'grey',
            }
        ],
        
    ]);

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Consumer Groups';
        p.addBreadcrumb('Consumer Groups', '/consumer-groups');
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConsumerGroups(force);
    }

    triggerSearchBySchemaId() {
        const searchAsNum = Number(uiSettings.schemaList.quickSearch.trim());
        if (!isNaN(searchAsNum)) {
            // Keep calling it to keep the list updated
            // Extra calls (even when we already have data) will be automatically caught by caching
            this.isLoadingSchemaVersionMatches = true;
            api.refreshSchemaUsagesById(searchAsNum).finally(() => (this.isLoadingSchemaVersionMatches = false));
        }
    }

    SearchBar = observer(() => {
        return (
            <SearchField
                width="350px"
                placeholderText="Filter by group id"
                searchText={uiSettings.consumerGroupList.quickSearch}
                setSearchText={(x) => (uiSettings.consumerGroupList.quickSearch = x)}
            />
        );
    });

    GroupState = (p: { group: GroupDescription }) => {
        const state = p.group.state.toLowerCase();
        const stateProps = this.stateProps.get(state);

        return (
            <Flex>
                <Tooltip label={stateProps?.description} placement="top" hasArrow>
                    <Flex>
                        <Icon as={stateProps?.icon} color={stateProps?.color} boxSize={5} mr={1} />
                        <Text>{stateProps?.text}</Text>
                    </Flex>
                </Tooltip>
            </Flex>
        );
    };

    render() {
        let groups = Array.from(api.consumerGroups.values());
        groups.push({
            groupId: 'test',
            state: 'dead',
            protocol: 'none',
            protocolType: 'none',
            members: [],
            coordinatorId: 0,
            topicOffsets: [],
            allowedActions: null,
            lagSum: 0,
            isInUse: false,
            noEditPerms: false,
            noDeletePerms: false
        })
        groups.push({
            groupId: 'test2',
            state: 'preparingrebalance',
            protocol: 'none',
            protocolType: 'none',
            members: [],
            coordinatorId: 0,
            topicOffsets: [],
            allowedActions: null,
            lagSum: 0,
            isInUse: false,
            noEditPerms: false,
            noDeletePerms: false
        })
        groups.push({
            groupId: 'test2',
            state: 'completingrebalance',
            protocol: 'none',
            protocolType: 'none',
            members: [],
            coordinatorId: 0,
            topicOffsets: [],
            allowedActions: null,
            lagSum: 1,
            isInUse: false,
            noEditPerms: false,
            noDeletePerms: false
        })

        try {
            const quickSearchRegExp = new RegExp(uiSettings.consumerGroupList.quickSearch, 'i')
            groups = groups
                .filter(groupDescription =>
                    groupDescription.groupId.match(quickSearchRegExp) ||
                    groupDescription.protocol.match(quickSearchRegExp)
                );
        } catch (e) {
            console.warn('Invalid expression')
        }

        return (
            <PageContent key="b">
                {/* Statistics Bar */}
                <Flex gap="1rem" alignItems="center">
                    <SmallStat title="Total Groups">{groups.length ?? <InlineSkeleton width="100px" />}</SmallStat>
                    <Divider height="2ch" orientation="vertical" />
                    <SmallStat title="Stable Groups">
                        {groups.filter((x) => x.state == 'Stable').length ?? <InlineSkeleton width="100px" />}
                    </SmallStat>
                </Flex>

                <Flex alignItems="center" gap="4" mt="5">
                    <this.SearchBar />
                </Flex>

                <Flex>
                    <DataTable<GroupDescription>
                        data={groups}
                        pagination
                        sorting
                        columns={[
                            {
                                header: 'Group ID',
                                accessorKey: 'groupId',
                                cell: ({ row: { original } }) => (
                                    <Link to={`/consumer-groups/${encodeURIComponent(original.groupId)}`}>
                                        {original.groupId}
                                    </Link>
                                ),
                                size: Infinity,
                            },
                            {
                                header: 'State',
                                accessorKey: 'state',
                                size: 130,
                                cell: ({ row: { original } }) => <this.GroupState group={original} />,
                            },
                            {
                                header: 'Coordinator',
                                accessorKey: 'coordinatorId',
                                size: 1,
                                cell: ({ row: { original } }) => <BrokerList brokerIds={[original.coordinatorId]} />,
                            },
                            {
                                header: 'Total Lag',
                                accessorKey: 'lagSum',
                                cell: ({ row: { original } }) => ShortNum({ value: original.lagSum }),
                            },
                        ]}
                    />
                </Flex>
            </PageContent>
        );
    }
}

export default ConsumerGroupList;
