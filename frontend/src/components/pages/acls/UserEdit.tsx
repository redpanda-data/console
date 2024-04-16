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
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { Box, Button, Flex, Heading, Input, createStandaloneToast, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { RoleSelector } from './UserCreate';

const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000,
    },
});

@observer
class UserEditPage extends PageComponent<{ userName: string; }> {

    @observable originalRoles: Set<string> | undefined = undefined;
    @observable selectedRoles: string[] | undefined = undefined;
    @observable isSaving = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Edit user ' + this.props.userName;
        p.addBreadcrumb('Access control', '/security');
        p.addBreadcrumb('Users', '/security/users');
        p.addBreadcrumb(this.props.userName, `/security/users/${this.props.userName}/edit`);

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true)
        ]);

        rolesApi.refreshRoles();
        rolesApi.refreshRoleMembers();
    }

    render() {
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

        const userName = this.props.userName;

        // Load roles the user is assigned to, for this we need all roles
        if (this.selectedRoles == undefined || this.originalRoles == undefined) {
            this.originalRoles = new Set<string>();
            for (const [name, members] of rolesApi.roleMembers) {
                if (members.any(x => x.name == userName))
                    this.originalRoles.add(name);
            }

            this.selectedRoles = [...this.originalRoles.values()];
        }

        const onCancel = () => appGlobal.history.push(`/security/users/${userName}/details`);


        // Check if there are any roles removed, added, or replaced
        // only then will the save button be enabled
        // First check if they have the same number of roles
        let hasChanges = false;
        const originalRoles = [...this.originalRoles.values()];
        const sameLength = originalRoles.length == this.selectedRoles.length;
        if (!sameLength) {
            hasChanges = true;
        } else {
            // Check if there were some replacements
            for (const r of this.selectedRoles)
                if (!originalRoles.includes(r)) {
                    hasChanges = true;
                    break;
                }

            for (const r of originalRoles)
                if (!this.selectedRoles.includes(r)) {
                    hasChanges = true;
                    break;
                }
        }


        const onSave = () => {

            toast({
                description: 'todo'
            });
        };

        return <>
            <ToastContainer />

            <PageContent>
                <Box>
                    <Heading as="h2">Create user</Heading>
                    <Box>This is a Redpanda SASL/SCRAM user. For other types of users and authentication, see our documentation.</Box>

                    <Heading as="h3" mt="4">Username</Heading>
                    <Input isReadOnly value={this.props.userName} width="300px" />

                    <Heading as="h3" mt="4">Assignments</Heading>
                    <RoleSelector state={this.selectedRoles} />


                    <Flex gap={4} mt={8}>
                        <Button colorScheme="brand" onClick={onSave} isDisabled={this.isSaving || !hasChanges} isLoading={this.isSaving} loadingText="Saving...">
                            Save
                        </Button>
                        <Button variant="link" isDisabled={this.isSaving} onClick={onCancel}>
                            Cancel
                        </Button>
                    </Flex>
                </Box>
            </PageContent>
        </>
    }


}

export default UserEditPage;


