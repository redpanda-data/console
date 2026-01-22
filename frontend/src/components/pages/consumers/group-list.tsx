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

import { DataTable, Flex, Grid, SearchField, Tag, Text } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { autorun, type IReactionDisposer } from 'mobx';
import { observer } from 'mobx-react';

import { GroupState } from './group-details';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { GroupDescription } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { editQuery } from '../../../utils/query-helper';
import { getSearchRegex } from '../../../utils/regex';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { BrokerList } from '../../misc/broker-list';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { ShortNum } from '../../misc/short-num';
import { Statistic } from '../../misc/statistic';
import { PageComponent, type PageInitHelper } from '../page';

@observer
class GroupList extends PageComponent {
  quickSearchReaction: IReactionDisposer;

  initPage(p: PageInitHelper): void {
    p.title = 'Consumer Groups';
    p.addBreadcrumb('Consumer Groups', '/groups');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  componentDidMount() {
    // 1. use 'q' parameter for quick search (if it exists)
    editQuery((query) => {
      if (query.q) {
        uiSettings.consumerGroupList.quickSearch = String(query.q);
      }
    });

    // 2. whenever the quick search box changes, update the url
    this.quickSearchReaction = autorun(() => {
      editQuery((query) => {
        const q = String(uiSettings.consumerGroupList.quickSearch);
        if (q) {
          query.q = q;
        }
      });
    });
  }
  componentWillUnmount() {
    if (this.quickSearchReaction) {
      this.quickSearchReaction();
    }
  }

  refreshData(force: boolean) {
    api.refreshConsumerGroups(force);
  }

  render() {
    if (!api.consumerGroups) {
      return DefaultSkeleton;
    }

    let groups = Array.from(api.consumerGroups.values());

    if (uiSettings.consumerGroupList.quickSearch) {
      const searchRegex = getSearchRegex(uiSettings.consumerGroupList.quickSearch);
      groups = groups.filter(
        (groupDescription) =>
          groupDescription.groupId.match(searchRegex) || groupDescription.protocol.match(searchRegex)
      );
    }

    const stateGroups = groups.groupInto((g) => g.state);

    return (
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
              <Statistic key={g.key} marginRight={'1.5rem'} title={g.key} value={g.items.length} />
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
                cell: ({ row: { original } }) => (
                  <Link params={{ groupId: encodeURIComponent(original.groupId) }} to="/groups/$groupId">
                    <this.GroupId group={original} />
                  </Link>
                ),
                size: Number.POSITIVE_INFINITY,
              },
              {
                header: 'Coordinator',
                accessorKey: 'coordinatorId',
                size: 1,
                cell: ({ row: { original } }) => <BrokerList brokerIds={[original.coordinatorId]} />,
              },
              {
                header: 'Protocol',
                accessorKey: 'protocol',
                size: 1,
              },
              {
                header: 'Members',
                accessorKey: 'members',
                size: 1,
                cell: ({ row: { original } }) => original.members.length,
              },
              {
                header: 'Offset Lag (Sum)',
                accessorKey: 'lagSum',
                cell: ({ row: { original } }) => ShortNum({ value: original.lagSum }),
              },
            ]}
            data={groups}
            pagination
            sorting
          />
        </Section>
      </PageContent>
    );
  }

  SearchBar = observer(() => (
    <SearchField
      placeholderText="Enter search term/regex"
      searchText={uiSettings.consumerGroupList.quickSearch}
      setSearchText={(x) => {
        uiSettings.consumerGroupList.quickSearch = x;
      }}
      width="350px"
    />
  ));

  GroupId = (p: { group: GroupDescription }) => {
    const protocol = p.group.protocolType;

    const groupIdEl = (
      <Text whiteSpace="break-spaces" wordBreak="break-word">
        {p.group.groupId}
      </Text>
    );

    if (protocol === 'consumer') {
      return groupIdEl;
    }

    return (
      <Grid alignItems="center" gap={2} templateColumns="auto 1fr">
        <Tag>Protocol: {protocol}</Tag>
        {groupIdEl}
      </Grid>
    );
  };
}

export default GroupList;
