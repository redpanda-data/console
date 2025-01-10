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

import { Link as ChakraLink, Tag } from '@redpanda-data/ui';
import { Box, Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { api, rolesApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';

export const UserRoleTags = observer(
  ({
    userName,
    showMaxItems = Number.POSITIVE_INFINITY,
  }: {
    userName: string;
    showMaxItems?: number;
  }) => {
    const elements: JSX.Element[] = [];
    let numberOfVisibleElements = 0;
    let numberOfHiddenElements = 0;

    if (Features.rolesApi) {
      // Get all roles, and ACL sets that apply to this user
      const roles = [];
      for (const [roleName, members] of rolesApi.roleMembers) {
        if (!members.any((m) => m.name === userName)) {
          continue; // this role doesn't contain our user
        }
        roles.push(roleName);
      }

      numberOfVisibleElements = Math.min(roles.length, showMaxItems);
      numberOfHiddenElements = showMaxItems === Number.POSITIVE_INFINITY ? 0 : Math.max(0, roles.length - showMaxItems);

      for (let i = 0; i < numberOfVisibleElements; i++) {
        const r = roles[i];
        elements.push(
          <React.Fragment key={r}>
            <ChakraLink as={ReactRouterLink} to={`/security/roles/${r}/details`} textDecoration="none">
              <Tag>{r}</Tag>
            </ChakraLink>
          </React.Fragment>,
        );

        if (i < numberOfVisibleElements - 1)
          elements.push(
            <Box whiteSpace="pre" userSelect="none">
              {', '}
            </Box>,
          );
      }

      if (elements.length === 0) elements.push(<Flex>No roles</Flex>);
      if (numberOfHiddenElements > 0) elements.push(<Text pl={1}>{`+${numberOfHiddenElements} more`}</Text>);
    }

    const hasAcls = api.ACLs?.aclResources.any((r) => r.acls.any((a) => a.principal === `User:${userName}`));
    if (hasAcls) {
      if (elements.length > 0) elements.push(<Flex>, </Flex>);
      elements.push(<Flex>has ACLs</Flex>);
    }

    return <Flex>{elements}</Flex>;
  },
);
