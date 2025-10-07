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

import { RoleForm } from './role-form';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

@observer
class RoleCreatePage extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Create role';
    p.addBreadcrumb('Access control', '/security');
    p.addBreadcrumb('Roles', '/security/roles');
    p.addBreadcrumb('Create role', '/security/roles/create');

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    this.refreshData().catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    appGlobal.onRefresh = () => this.refreshData().catch(console.error);
  }

  async refreshData() {
    await Promise.allSettled([api.refreshServiceAccounts(), rolesApi.refreshRoles()]);
  }

  render() {
    if (!api.serviceAccounts?.users) {
      return DefaultSkeleton;
    }

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
