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
import { RoleForm } from './RoleForm';
import { principalGroupsView } from './Models';


@observer
class RoleEditPage extends PageComponent<{ roleName: string }> {

    @observable allDataLoaded  = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const roleName = decodeURIComponent(this.props.roleName);

        p.title = 'Edit role';
        p.addBreadcrumb('Access control', '/security');
        p.addBreadcrumb('Roles', '/security/roles');
        p.addBreadcrumb(roleName, `/security/roles/${roleName}`);

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true),
        ]);

        await rolesApi.refreshRoles();
        await rolesApi.refreshRoleMembers();

        this.allDataLoaded = true
    }

    render() {
        // if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
        // if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;
        if (!this.allDataLoaded) return DefaultSkeleton;

        const aclPrincipalGroup = principalGroupsView.principalGroups.find(({
            principalType,
            principalName
        }) => principalType === 'RedpandaRole' && principalName === this.props.roleName);

        const principals = rolesApi.roleMembers.get(this.props.roleName)

        return <>
            <PageContent>
                <RoleForm initialData={{
                    roleName: this.props.roleName,
                    topicACLs: aclPrincipalGroup?.topicAcls ?? [],
                    consumerGroupsACLs: aclPrincipalGroup?.consumerGroupAcls ?? [],
                    clusterACLs: aclPrincipalGroup?.clusterAcls,
                    transactionalIDACLs: aclPrincipalGroup?.transactionalIdAcls ?? [],
                    host: aclPrincipalGroup?.host ?? '',
                    principals: principals ?? [],
                }}/>
            </PageContent>
        </>
    }

}

export default RoleEditPage;

