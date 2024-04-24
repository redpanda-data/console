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
                <ChakraLink as={ReactRouterLink} to={`/security/roles/${r}/details`}>{r}</ChakraLink>
            </React.Fragment>
        );

        if (i < numberOfVisibleElements - 1)
            elements.push(<Box whiteSpace="pre" userSelect="none">{', '}</Box>);
    }

    return <Flex>
        {elements}
        {numberOfHiddenElements !== 0 && <Text pl={1}>{`+${numberOfHiddenElements} more`}</Text>}
    </Flex>;
});
