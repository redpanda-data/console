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

import { Box, DataTable, Text } from '@redpanda-data/ui';
import { UserAclsCard } from 'components/pages/roles/user-acls-card';
import { UserInformationCard } from 'components/pages/roles/user-information-card';
import { UserRolesCard } from 'components/pages/roles/user-roles-card';
import { Button } from 'components/redpanda-ui/components/button';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type { UpdateRoleMembershipResponse } from 'protogen/redpanda/api/console/v1alpha1/security_pb';

import { DeleteUserConfirmModal } from './delete-user-confirm-modal';
import type { AclPrincipalGroup } from './models';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper, type PageProps } from '../page';

@observer
class UserDetailsPage extends PageComponent<{ userName: string }> {
  @observable username = '';

  @observable isValidUsername = false;
  @observable isValidPassword = false;

  @observable generateWithSpecialChars = false;
  @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
  @observable isCreating = false;

  @observable selectedRoles: string[] = [];

  @observable isChangePasswordModalOpen = false;
  @observable isChangeRolesModalOpen = false;

  constructor(p: Readonly<PageProps<{ userName: string }>>) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Create user';
    p.addBreadcrumb('Access Control', '/security');
    p.addBreadcrumb('Users', '/security/users');
    p.addBreadcrumb(this.props.userName, '/security/users/');

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    this.refreshData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    appGlobal.onRefresh = () => this.refreshData(true).catch(console.error);
  }

  async refreshData(force: boolean) {
    if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
      return;
    }

    await Promise.allSettled([
      api.refreshAcls(AclRequestDefault, force),
      api.refreshServiceAccounts(),
      rolesApi.refreshRoles(),
    ]);

    await rolesApi.refreshRoleMembers();
  }

  render() {
    if (!api.serviceAccounts?.users) {
      return DefaultSkeleton;
    }
    const userName = this.props.userName;

    const isServiceAccount = api.serviceAccounts.users.includes(userName);

    return (
      <PageContent>
        <div className="flex flex-col gap-4">
          <UserInformationCard
            onEditPassword={api.isAdminApiConfigured ? () => (this.isChangePasswordModalOpen = true) : undefined}
            username={userName}
          />
          <UserPermissionDetailsContent
            onChangeRoles={Features.rolesApi ? () => (this.isChangeRolesModalOpen = true) : undefined}
            userName={userName}
          />
          <div>
            {isServiceAccount && (
              <DeleteUserConfirmModal
                buttonEl={
                  <Button disabled={!isServiceAccount} variant="destructive">
                    Delete user
                  </Button>
                }
                onConfirm={async () => {
                  await api.deleteServiceAccount(userName);

                  // Remove user from all its roles
                  const promises: Promise<UpdateRoleMembershipResponse>[] = [];
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
                userName={userName}
              />
            )}
          </div>

          {/*Modals*/}
          {api.isAdminApiConfigured && (
            <ChangePasswordModal
              isOpen={this.isChangePasswordModalOpen}
              setIsOpen={(value: boolean) => (this.isChangePasswordModalOpen = value)}
              userName={userName}
            />
          )}

          {Features.rolesApi && (
            <ChangeRolesModal
              isOpen={this.isChangeRolesModalOpen}
              setIsOpen={(value: boolean) => (this.isChangeRolesModalOpen = value)}
              userName={userName}
            />
          )}
        </div>
      </PageContent>
    );
  }
}

export default UserDetailsPage;

const UserPermissionDetailsContent = observer((p: { userName: string; onChangeRoles?: () => void }) => {
  // Get all roles and ACLs matching this user
  const roles: {
    principalType: string;
    principalName: string;
  }[] = [];

  if (Features.rolesApi) {
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (!members.any((m) => m.name === p.userName)) {
        continue; // this role doesn't contain our user
      }
      roles.push({
        principalType: 'RedpandaRole',
        principalName: roleName,
      });
    }
  }

  const { data: acls } = useGetAclsByPrincipal(`User:${p.userName}`);

  return (
    <div className="flex flex-col gap-4">
      <UserRolesCard onChangeRoles={p.onChangeRoles} roles={roles} />
      <UserAclsCard acls={acls} />
    </div>
  );
});

// TODO: remove this component when we update RoleDetails
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 70, refactor later
export const AclPrincipalGroupPermissionsTable = observer((p: { group: AclPrincipalGroup }) => {
  const entries: {
    type: string;
    selector: string;
    operations: {
      allow: string[];
      deny: string[];
    };
  }[] = [];

  // Convert all entries of the group into a table row
  const group = p.group;
  for (const topicAcl of group.topicAcls) {
    const allow: string[] = [];
    const deny: string[] = [];

    if (topicAcl.all === 'Allow') {
      allow.push('All');
    } else if (topicAcl.all === 'Deny') {
      deny.push('All');
    } else {
      for (const [permName, value] of Object.entries(topicAcl.permissions)) {
        if (value === 'Allow') {
          allow.push(permName);
        }
        if (value === 'Deny') {
          deny.push(permName);
        }
      }
    }

    if (allow.length === 0 && deny.length === 0) {
      continue;
    }

    entries.push({
      type: 'Topic',
      selector: topicAcl.selector,
      operations: { allow, deny },
    });
  }

  for (const groupAcl of group.consumerGroupAcls) {
    const allow: string[] = [];
    const deny: string[] = [];

    if (groupAcl.all === 'Allow') {
      allow.push('All');
    } else if (groupAcl.all === 'Deny') {
      deny.push('All');
    } else {
      for (const [permName, value] of Object.entries(groupAcl.permissions)) {
        if (value === 'Allow') {
          allow.push(permName);
        }
        if (value === 'Deny') {
          deny.push(permName);
        }
      }
    }

    if (allow.length === 0 && deny.length === 0) {
      continue;
    }

    entries.push({
      type: 'ConsumerGroup',
      selector: groupAcl.selector,
      operations: { allow, deny },
    });
  }

  for (const transactId of group.transactionalIdAcls) {
    const allow: string[] = [];
    const deny: string[] = [];

    if (transactId.all === 'Allow') {
      allow.push('All');
    } else if (transactId.all === 'Deny') {
      deny.push('All');
    } else {
      for (const [permName, value] of Object.entries(transactId.permissions)) {
        if (value === 'Allow') {
          allow.push(permName);
        }
        if (value === 'Deny') {
          deny.push(permName);
        }
      }
    }

    if (allow.length === 0 && deny.length === 0) {
      continue;
    }

    entries.push({
      type: 'TransactionalID',
      selector: transactId.selector,
      operations: { allow, deny },
    });
  }

  // Cluster
  {
    const clusterAcls = group.clusterAcls;

    const allow: string[] = [];
    const deny: string[] = [];

    if (clusterAcls.all === 'Allow') {
      allow.push('All');
    } else if (clusterAcls.all === 'Deny') {
      deny.push('All');
    } else {
      for (const [permName, value] of Object.entries(clusterAcls.permissions)) {
        if (value === 'Allow') {
          allow.push(permName);
        }
        if (value === 'Deny') {
          deny.push(permName);
        }
      }
    }

    // Cluster only appears once, so it won't be filtered automatically,
    // we need to manually skip this entry if there isn't any content
    if (allow.length + deny.length > 0) {
      entries.push({
        type: 'Cluster',
        selector: '',
        operations: { allow, deny },
      });
    }
  }

  if (entries.length === 0) {
    return 'No permissions assigned';
  }

  return (
    <DataTable
      columns={[
        {
          header: 'Type',
          accessorKey: 'type',
          size: 150,
        },
        {
          header: 'Selector',
          accessorKey: 'selector',
          size: 300,
        },
        {
          header: 'Operations',
          size: Number.POSITIVE_INFINITY,
          cell: ({ row: { original: record } }) => {
            const allow = record.operations.allow;
            const deny = record.operations.deny;

            return (
              <Box>
                {allow.length > 0 && (
                  <Box whiteSpace="pre">
                    <Text as="span" fontWeight="semibold">
                      Allow:{' '}
                    </Text>
                    <Text as="span">{allow.join(', ')}</Text>
                  </Box>
                )}
                {deny.length > 0 && (
                  <Box>
                    <Text as="span" fontWeight="semibold">
                      Deny:{' '}
                    </Text>
                    <Text as="span">{deny.join(', ')}</Text>
                  </Box>
                )}
              </Box>
            );
          },
        },
      ]}
      data={entries}
    />
  );
});
