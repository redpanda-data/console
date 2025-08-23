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

import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { EmbeddedAclDetail } from 'components/pages/acls/new-acl/ACLDetails';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { DeleteUserConfirmModal } from './DeleteUserConfirmModal';
import { ChangePasswordModal, ChangeRolesModal } from './UserEditModals';
import { UserRoleTags } from './UserPermissionAssignments';
import { useQuery } from '@connectrpc/connect-query';
import { listACLs } from '../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { ListACLsRequest } from '../../../protogen/redpanda/api/dataplane/v1/acl_pb';

@observer
class UserDetailsPage extends PageComponent<{ userName: string }> {
  @observable username = '';
  @observable mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512' = 'SCRAM-SHA-256';

  @observable isValidUsername = false;
  @observable isValidPassword = false;

  @observable generateWithSpecialChars = false;
  @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
  @observable isCreating = false;

  @observable selectedRoles: string[] = [];

  @observable isChangePasswordModalOpen = false;
  @observable isChangeRolesModalOpen = false;

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
      api.refreshServiceAccounts(),
      rolesApi.refreshRoles(),
    ]);

    await rolesApi.refreshRoleMembers();
  }

  render() {
    if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;
    const userName = this.props.userName;

    const isServiceAccount = api.serviceAccounts.users.includes(userName);

    let canEdit = true;
    // The only thing that can be editted in a user is its roles
    // If the roles api is not available, then no need for an edit button
    if (!Features.rolesApi) canEdit = false;

    return (
      <PageContent>
        <div className="flex justify-between">
          <div>
            <h3>Permissions</h3>
            <p className="text-sm text-gray-600">The following permissions are assigned to this principal.</p>
          </div>
          <div className="flex gap-3">
            {Features.rolesApi && (
              <Button variant="outline" onClick={() => (this.isChangeRolesModalOpen = true)} disabled={!canEdit}>
                Change roles
              </Button>
            )}
            {api.isAdminApiConfigured && (
              <Button variant="outline" onClick={() => (this.isChangePasswordModalOpen = true)} disabled={!canEdit}>
                Change password
              </Button>
            )}
            {/* todo: refactor delete user dialog into a "fire and forget" dialog and use it in the overview list (and here) */}
            {isServiceAccount && (
              <DeleteUserConfirmModal
                onConfirm={async () => {
                  await api.deleteServiceAccount(userName);

                  // Remove user from all its roles
                  const promises = [];
                  for (const [roleName, members] of rolesApi.roleMembers) {
                    if (members.any((m) => m.name === userName)) {
                      // is this user part of this role?
                      // then remove it
                      promises.push(rolesApi.updateRoleMembership(roleName, [], [userName]));
                    }
                  }
                  await Promise.allSettled(promises);
                  await api.refreshServiceAccounts();
                  await rolesApi.refreshRoleMembers();
                  appGlobal.historyPush('/security/users/');
                }}
                buttonEl={
                  <Button variant="destructive" disabled={!isServiceAccount}>
                    Delete
                  </Button>
                }
                userName={userName}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 start">
          <div className="sm:col-span-5 md:col-span-3">
            <UserPermissionDetailsContent userName={userName} />
          </div>

          <div className="sm:col-span-5 md:col-span-2">
            <Card size="full">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-gray-900">Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <UserRoleTags userName={userName} verticalView={false} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/*Modals*/}
        {api.isAdminApiConfigured && (
          <ChangePasswordModal
            userName={userName}
            isOpen={this.isChangePasswordModalOpen}
            setIsOpen={(value: boolean) => (this.isChangePasswordModalOpen = value)}
          />
        )}

        {Features.rolesApi && (
          <ChangeRolesModal
            userName={userName}
            isOpen={this.isChangeRolesModalOpen}
            setIsOpen={(value: boolean) => (this.isChangeRolesModalOpen = value)}
          />
        )}
      </PageContent>
    );
  }
}

export default UserDetailsPage;

const UserPermissionDetailsContent = observer((p: { userName: string }) => {
  // Get all roles and ACLs matching this user
  const roles: {
    principalType: string;
    principalName: string;
  }[] = [];

  if (Features.rolesApi) {
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (!members.any((m) => m.name === p.userName)) continue; // this role doesn't contain our user
      roles.push({
        principalType: 'RedpandaRole',
        principalName: roleName,
      });
    }
  }

  const { data: hasAcls } = useQuery(
    listACLs,
    {
      filter: {
        principal: `User:${p.userName}`,
      },
    } as ListACLsRequest,
    {
      enabled: !!p.userName,
      select: (response) => {
        return response.resources.length > 0;
      },
    },
  );

  if (hasAcls) {
    roles.push({
      principalType: 'User',
      principalName: p.userName,
    });
  }

  return (
    <div className="gap-3 flex flex-col">
      {roles.map((g) => {
        return (
          <EmbeddedAclDetail
            principal={`${g.principalType}:${g.principalName}`}
            key={`key-${g.principalType}:${g.principalName}`}
          />
        );
      })}
      {roles.length === 0 && (
        <Card size="full">
          <CardContent>
            <p>No permissions assigned to this user.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
