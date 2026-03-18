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

import { useEffect, useState } from 'react';

import { principalGroupsView } from './models';
import { RoleForm } from './role-form';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

async function refreshEditData(force: boolean) {
  if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
    return;
  }

  await Promise.allSettled([
    api.refreshAcls(AclRequestDefault, force),
    api.refreshServiceAccounts(),
    rolesApi.refreshRoles(),
    rolesApi.refreshRoleMembers(),
  ]);
}

class RoleEditPage extends PageComponent<{ roleName: string }> {
  initPage(p: PageInitHelper): void {
    const roleName = decodeURIComponent(this.props.roleName);
    p.title = 'Edit role';
    p.addBreadcrumb('Access Control', '/security');
    p.addBreadcrumb('Roles', '/security/roles');
    p.addBreadcrumb(roleName, `/security/roles/${encodeURIComponent(this.props.roleName)}`);

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    refreshEditData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    appGlobal.onRefresh = () => refreshEditData(true).catch(console.error);
  }

  render() {
    return <RoleEditPageContent roleName={this.props.roleName} />;
  }
}

const RoleEditPageContent = ({ roleName: encodedRoleName }: { roleName: string }) => {
  const roleName = decodeURIComponent(encodedRoleName);
  const [allDataLoaded, setAllDataLoaded] = useState(false);

  useEffect(() => {
    refreshEditData(true)
      .then(() => setAllDataLoaded(true))
      // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
      .catch(console.error);
  }, []);

  if (!allDataLoaded) {
    return DefaultSkeleton;
  }

  const aclPrincipalGroup = principalGroupsView.principalGroups.find(
    ({ principalType, principalName }) => principalType === 'RedpandaRole' && principalName === roleName
  );

  const principals = rolesApi.roleMembers.get(roleName);

  return (
    <PageContent>
      <RoleForm
        initialData={{
          roleName,
          topicACLs: aclPrincipalGroup?.topicAcls ?? [],
          consumerGroupsACLs: aclPrincipalGroup?.consumerGroupAcls ?? [],
          clusterACLs: aclPrincipalGroup?.clusterAcls,
          transactionalIDACLs: aclPrincipalGroup?.transactionalIdAcls ?? [],
          host: aclPrincipalGroup?.host ?? '',
          principals: principals ?? [],
        }}
      />
    </PageContent>
  );
};

export default RoleEditPage;
