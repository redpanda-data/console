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

import { Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { RoleForm } from './RoleForm';

@observer
class RoleCreatePage extends PageComponent {
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
        <Text my={4}>
          A role is a named collection of ACLs which may have users (security principals) assigned to it. You can assign
          any number of roles to a given user.
        </Text>
        <RoleForm />
      </PageContent>
    );
  }
}

export default RoleCreatePage;
