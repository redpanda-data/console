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
import { rolesApi } from '../../../state/backendApi';
import { Link as ReactRouterLink } from 'react-router-dom';
import { Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { Box, Flex, Text } from '@redpanda-data/ui';

export const UserPermissionAssignments = observer(({
                                                       userName,
                                                       showMaxItems = Infinity
                                                   }: {
    userName: string;
    showMaxItems?: number;
}) => {
    // Get all roles, and ACL sets that apply to this user
    const roles = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
        if (!members.any(m => m.name == userName)) {
            continue; // this role doesn't contain our user
        }
        roles.push(roleName);
    }

    const elements: JSX.Element[] = [];

    const numberOfVisibleElements = Math.min(roles.length, showMaxItems);
    const numberOfHiddenElements = showMaxItems === Infinity ? 0 : Math.max(0, roles.length - showMaxItems);

    for (let i = 0; i < numberOfVisibleElements; i++) {
        const r = roles[i];
        elements.push(
            <React.Fragment key={r}>
                <ChakraLink as={ReactRouterLink} to={`/security/roles/${r}/details`} textDecoration="none">
                    {r}
                </ChakraLink>
            </React.Fragment>
        );

        if (i < numberOfVisibleElements - 1)
            elements.push(<Box whiteSpace="pre" userSelect="none">{', '}</Box>);
    }

    if (elements.length == 0) {
        return <Flex>
            No roles
        </Flex>
    }

    return <Flex>
        {elements}
        {numberOfHiddenElements !== 0 && <Text pl={1}>{`+${numberOfHiddenElements} more`}</Text>}
    </Flex>;
});
