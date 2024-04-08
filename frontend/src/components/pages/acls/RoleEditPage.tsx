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
import { makeObservable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { Button, Flex } from '@redpanda-data/ui';


@observer
class RoleEditPage extends PageComponent<{ roleName: string }> {

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Edit role';
        p.addBreadcrumb('Access control', '/security');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true),
            rolesApi.refreshRoles(),
            rolesApi.refreshRoleMembers(),
        ]);
    }

    render() {
        if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;


        return <>

            <PageContent>

                <Flex gap={4} mt={8}>
                    <Button colorScheme="brand" >
                        Save
                    </Button>
                    <Button variant="delete" onClick={() => appGlobal.history.push('/security/roles/')}>
                        Cancel
                    </Button>
                </Flex>
            </PageContent>
        </>
    }

}

export default RoleEditPage;

