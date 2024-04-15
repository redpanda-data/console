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
import { api, RolePrincipal, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { ClusterACLs, ConsumerGroupACLs, createEmptyClusterAcl, createEmptyConsumerGroupAcl, createEmptyTopicAcl, createEmptyTransactionalIdAcl, TopicACLs, TransactionalIdACLs } from './Models';
import { RoleForm } from './RoleForm';

@observer
class RoleCreatePage extends PageComponent<{}> {

    // Name of the role
    @observable roleName: string = '';

    // Members that are part of the role
    @observable members: RolePrincipal[] = [];

    // Permissions that will be applied to the role
    @observable topicAcls: TopicACLs = createEmptyTopicAcl();
    @observable consumerGroupAcls: ConsumerGroupACLs = createEmptyConsumerGroupAcl();
    @observable transactionalIdAcls: TransactionalIdACLs = createEmptyTransactionalIdAcl();
    @observable clusterAcls: ClusterACLs = createEmptyClusterAcl();


    constructor(p: any) {
        super(p);
        makeObservable(this);
        this.onCreateRole = this.onCreateRole.bind(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Create role';
        p.addBreadcrumb('Access control', '/security');
        p.addBreadcrumb('Roles', '/security/roles');
        p.addBreadcrumb('Create role', '/security/roles/create');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true),
            rolesApi.refreshRoles(),
        ]);
    }

    render() {
        if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

        return (
            <PageContent>
                <RoleForm />
            </PageContent>
        );
    }

    async onCreateRole(): Promise<void> {
        // try {
        //     this.isCreating = true;
        //
        //     // create role with members
        //
        //     // create all acls individually
        //
        //     // Refresh roles
        //
        // } catch (err) {
        //     toast({
        //         status: 'error',
        //         duration: null,
        //         isClosable: true,
        //         title: 'todo todo todo todo todo todo todo',
        //         description: String(err),
        //     });
        //     throw err;
        // } finally {
        //     this.isCreating = false;
        // }
    };
}

export default RoleCreatePage;

