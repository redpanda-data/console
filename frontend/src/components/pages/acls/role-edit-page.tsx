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
import { PageComponent, type PageInitHelper } from '../page';
import { useSecurityBreadcrumbs } from '../security/hooks/use-security-breadcrumbs';

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
    p.title = 'Access Control';

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

  useSecurityBreadcrumbs([
    { title: 'Roles', linkTo: '/security/roles' },
    { title: roleName, linkTo: `/security/roles/${encodeURIComponent(roleName)}/details` },
  ]);

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
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">Edit role: {roleName}</h2>
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
    </div>
  );
};

export default RoleEditPage;
