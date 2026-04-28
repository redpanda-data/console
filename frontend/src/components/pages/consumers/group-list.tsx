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
import type { FC } from 'react';
import { useEffect } from 'react';

import { GroupState } from './group-details';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { GroupDescription } from '../../../state/rest-interfaces';
import { useUISettingsStore } from '../../../state/ui';
import { editQuery } from '../../../utils/query-helper';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { BrokerList } from '../../misc/broker-list';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { ShortNum } from '../../misc/short-num';
import { Statistic } from '../../misc/statistic';
import { PageComponent, type PageInitHelper } from '../page';

class GroupList extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Consumer Groups';
    p.addBreadcrumb('Consumer Groups', '/groups');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshConsumerGroups(force);
  }

  render() {
    return <GroupListContent />;
  }
}

const GroupListContent: FC = () => {
  const consumerGroups = useApiStoreHook((s) => s.consumerGroups);
  const { consumerGroupList, updateSettings } = useUISettingsStore();
  const { quickSearch } = consumerGroupList;

  useEffect(() => {
    api.refreshConsumerGroups(true);
    appGlobal.onRefresh = () => api.refreshConsumerGroups(true);
  }, []);

  // Initialize from URL query param on mount
  useEffect(() => {
    editQuery((query) => {
      if (query.q) {
        updateSettings({ consumerGroupList: { ...consumerGroupList, quickSearch: String(query.q) } });
      }
    });
  }, []);

  // Sync quickSearch to URL when it changes
  useEffect(() => {
    editQuery((query) => {
      if (quickSearch) {
        query.q = quickSearch;
      } else {
        delete query.q;
      }
    });
  }, [quickSearch]);

  if (!consumerGroups) {
    return DefaultSkeleton;
  }

  let groups = Array.from(consumerGroups.values());

  try {
    const quickSearchRegExp = new RegExp(quickSearch, 'i');
    groups = groups.filter(
      (groupDescription) =>
        groupDescription.groupId.match(quickSearchRegExp) || groupDescription.protocol.match(quickSearchRegExp)
    );
  } catch (_e) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('Invalid expression');
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

      <Section mt={4}>
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
          <SearchField
            placeholderText="Enter search term/regex"
            searchText={quickSearch}
            setSearchText={(x) => updateSettings({ consumerGroupList: { ...consumerGroupList, quickSearch: x } })}
            width="350px"
          />
        </div>
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
                <Link params={{ groupId: encodeURIComponent(original.groupId) }} search={{} as never} to="/groups/$groupId">
                  <GroupId group={original} />
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
};

const GroupId = (p: { group: GroupDescription }) => {
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

export default GroupList;
