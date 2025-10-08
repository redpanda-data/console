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

import { observer } from 'mobx-react';
import { Component } from 'react';

import { api } from '../../../state/backend-api';
import type { UserDetails } from '../../../state/rest-interfaces';
import { MotionDiv } from '../../../utils/animation-props';
import '../../../utils/array-extensions';
import { Accordion, Box, DataTable, Flex, SearchField, Text, Tooltip } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { MdOutlinePermIdentity } from 'react-icons/md';

import { RoleComponent } from './admin-roles';
import { DefaultSkeleton } from '../../../utils/tsx-utils';

@observer
export class AdminUsers extends Component<Record<string, never>> {
  @observable quickSearch = '';

  constructor(p: Record<string, never>) {
    super(p);
    makeObservable(this);
  }

  render() {
    if (!api.adminInfo) {
      return DefaultSkeleton;
    }

    let users = api.adminInfo.users;

    try {
      const quickSearchRegExp = new RegExp(this.quickSearch, 'i');
      users = users.filter(
        (u) => u.internalIdentifier.match(quickSearchRegExp) || u.oauthUserId.match(quickSearchRegExp)
      );
    } catch (_e) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.warn('Invalid expression');
    }

    const table = (
      <DataTable<UserDetails>
        columns={[
          {
            size: 1,
            header: 'Identifier',
            accessorKey: 'internalIdentifier',
            cell: ({ row }) => {
              if (row.original.internalIdentifier === api.userData?.displayName) {
                return (
                  <Flex gap={2}>
                    <Tooltip hasArrow label="You are currently logged in as this user" placement="top">
                      <Box>
                        <MdOutlinePermIdentity color="#ff9e3a" size={16} />
                      </Box>
                    </Tooltip>{' '}
                    <Text>{row.original.internalIdentifier}</Text>
                  </Flex>
                );
              }
              return row.original.internalIdentifier;
            },
          },
          { size: 1, header: 'OAuthUserID', accessorKey: 'oauthUserId' },
          {
            size: 1,
            header: 'Roles',
            accessorKey: 'roles',
            cell: ({ row: { original: user } }) => user.grantedRoles.map((r) => r.role.name).join(', '),
          }, // can't sort
          { size: Number.POSITIVE_INFINITY, header: 'Login', accessorKey: 'loginProvider' },
        ]}
        data={users}
        expandRowByClick
        pagination
        sorting
        subComponent={({ row: { original: user } }) => (
          <Box px={10} py={6}>
            <Accordion
              defaultIndex={0}
              items={user.grantedRoles.map((r) => ({
                heading: r.role.name,
                description: <RoleComponent grantedBy={r.grantedBy} role={r.role} />,
              }))}
            />
          </Box>
        )}
      />
    );

    return (
      <MotionDiv>
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
          <SearchField
            placeholderText="Enter search term/regex"
            searchText={this.quickSearch}
            setSearchText={(x) => (this.quickSearch = x)}
            width="300px"
          />
        </div>

        {table}
      </MotionDiv>
    );
  }
}
