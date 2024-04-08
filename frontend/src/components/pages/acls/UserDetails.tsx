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
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { Box, Button, Flex, Heading } from '@redpanda-data/ui';

import { Link as ReactRouterLink } from 'react-router-dom'
import { Link as ChakraLink } from '@chakra-ui/react'

@observer
class UserDetailsPage extends PageComponent<{ userName: string; }> {

    @observable username: string = '';
    @observable mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512' = 'SCRAM-SHA-256';

    @observable isValidUsername: boolean = false;
    @observable isValidPassword: boolean = false;

    @observable generateWithSpecialChars: boolean = false;
    @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
    @observable isCreating: boolean = false;

    @observable selectedRoles: string[] = [];

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Create user';
        p.addBreadcrumb('Access control', '/security');
        p.addBreadcrumb('Users', '/security/users');
        p.addBreadcrumb(this.props.userName, '/security/users/');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true)
        ]);
    }

    render() {
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;
        const userName = this.props.userName;

        return <>
            <PageContent>
                <Flex gap="4">
                    <Button variant="outline" onClick={() => appGlobal.history.push(`/security/users/${userName}/edit`)}>
                        Edit
                    </Button>
                    {/* todo: refactor delete user dialog into a "fire and forget" dialog and use it in the overview list (and here) */}
                    <Button variant="outline-delete">
                        Delete
                    </Button>
                </Flex>

                <Heading as="h3" mt="4">Permissions</Heading>
                <Box>Below are all of the permissions assigned to this SCRAM user.</Box>

                <Heading as="h3" mt="4">Assignments</Heading>
                <UserPermissionAssignments userName={userName} />

                <PermissionAssignemntsDetails userName={userName} />

            </PageContent>
        </>
    }


}

export default UserDetailsPage;


const UserPermissionAssignments = observer((p: {
    userName: string;
}) => {

    // Get all roles, and ACL sets that apply to this user

    return <Flex>
        Roles for {p.userName}
        <ChakraLink as={ReactRouterLink} to={'/'}>
            placeholderRole1
        </ChakraLink>
        <Box whiteSpace="pre" userSelect="none">{', '}</Box>
        <ChakraLink as={ReactRouterLink} to={'/'}>
            placeholderRole2
        </ChakraLink>
    </Flex>
});

const PermissionAssignemntsDetails = observer((p: {
    userName: string;
}) => {

    // Get all roles and ACLs matching this user
    // For each "AclPrincipalGroup" show its name, then a table that shows the details


    return <>
        PermissionAssignemntsDetails: {p.userName}
    </>
});
