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
import { api } from '../../../state/backendApi';
import type { UserDetails } from '../../../state/restInterfaces';
import { MotionDiv } from '../../../utils/animationProps';
import '../../../utils/arrayExtensions';
import { Accordion, Box, DataTable, Flex, SearchField, Text, Tooltip } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { MdOutlinePermIdentity } from 'react-icons/md';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { RoleComponent } from './Admin.Roles';

@observer
export class AdminUsers extends Component<{}> {
  @observable quickSearch = '';

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  render() {
    if (!api.adminInfo) return DefaultSkeleton;

    let users = api.adminInfo.users;

    try {
      const quickSearchRegExp = new RegExp(this.quickSearch, 'i');
      users = users.filter(
        (u) => u.internalIdentifier.match(quickSearchRegExp) || u.oauthUserId.match(quickSearchRegExp),
      );
    } catch (e) {
      console.warn('Invalid expression');
    }

    const table = (
      <DataTable<UserDetails>
        data={users}
        pagination
        sorting
        expandRowByClick
        columns={[
          {
            size: 1,
            header: 'Identifier',
            accessorKey: 'internalIdentifier',
            cell: ({ row }) => {
              if (row.original.internalIdentifier === api.userData?.user.internalIdentifier) {
                return (
                  <Flex gap={2}>
                    <Tooltip label="You are currently logged in as this user" placement="top" hasArrow>
                      <Box>
                        <MdOutlinePermIdentity size={16} color="#ff9e3a" />
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
        subComponent={({ row: { original: user } }) => (
          <Box py={6} px={10}>
            <Accordion
              defaultIndex={0}
              items={user.grantedRoles.map((r) => ({
                heading: r.role.name,
                description: <RoleComponent role={r.role} grantedBy={r.grantedBy} />,
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
            width="300px"
            placeholderText="Enter search term/regex"
            searchText={this.quickSearch}
            setSearchText={(x) => (this.quickSearch = x)}
          />
        </div>

        {table}
      </MotionDiv>
    );
  }
}
