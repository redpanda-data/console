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
import type { UpdateRoleMembershipResponse } from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import { useEffect, useState } from 'react';

import { DeleteUserConfirmModal } from './delete-user-confirm-modal';
import type { AclPrincipalGroup } from './models';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import { useListRolesQuery } from '../../../react-query/api/security';
import { invalidateUsersCache, useLegacyListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';

type UserDetailsPageProps = {
  userName: string;
};

const UserDetailsPage = ({ userName }: UserDetailsPageProps) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);

  const { data: usersData, isLoading: isUsersLoading } = useLegacyListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];

  useEffect(() => {
    uiState.pageTitle = 'User details';
    uiState.pageBreadcrumbs = [];
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });
    uiState.pageBreadcrumbs.push({ title: 'Users', linkTo: '/security/users' });
    uiState.pageBreadcrumbs.push({ title: userName, linkTo: `/security/users/${userName}` });

    const refreshData = async () => {
      if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
        return;
      }
      await Promise.allSettled([
        api.refreshAcls(AclRequestDefault, true),
        api.refreshServiceAccounts(),
        rolesApi.refreshRoles(),
      ]);
      await rolesApi.refreshRoleMembers();
    };

    refreshData().catch(() => {
      // Silently ignore refresh errors
    });
    appGlobal.onRefresh = () =>
      refreshData().catch(() => {
        // Silently ignore refresh errors
      });
  }, [userName]);

  if (isUsersLoading) {
    return DefaultSkeleton;
  }

  const isServiceAccount = users.includes(userName);

  return (
    <PageContent>
      <div className="flex flex-col gap-4">
        <UserInformationCard
          onEditPassword={
            api.isAdminApiConfigured
              ? () => {
                  setIsChangePasswordModalOpen(true);
                }
              : undefined
          }
          username={userName}
        />
        <UserPermissionDetailsContent
          onChangeRoles={
            Features.rolesApi
              ? () => {
                  setIsChangeRolesModalOpen(true);
                }
              : undefined
          }
          userName={userName}
        />
        <div>
          {Boolean(isServiceAccount) && (
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
                    promises.push(rolesApi.updateRoleMembership(roleName, [], [userName]));
                  }
                }
                await Promise.allSettled(promises);
                await invalidateUsersCache();
                await rolesApi.refreshRoleMembers();
                appGlobal.historyPush('/security/users/');
              }}
              userName={userName}
            />
          )}
        </div>

        {Boolean(api.isAdminApiConfigured) && (
          <ChangePasswordModal
            isOpen={isChangePasswordModalOpen}
            setIsOpen={setIsChangePasswordModalOpen}
            userName={userName}
          />
        )}

        {Boolean(Features.rolesApi) && (
          <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={userName} />
        )}
      </div>
    </PageContent>
  );
};

export default UserDetailsPage;

const UserPermissionDetailsContent = ({
  userName,
  onChangeRoles,
}: {
  userName: string;
  onChangeRoles?: () => void;
}) => {
  const { data: rolesData } = useListRolesQuery({ filter: { principal: userName } });
  const { data: acls } = useGetAclsByPrincipal(`User:${userName}`);

  const roles = Features.rolesApi
    ? (rolesData?.roles ?? []).map((r) => ({
        principalType: 'RedpandaRole',
        principalName: r.name,
      }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <UserRolesCard onChangeRoles={onChangeRoles} roles={roles} />
      <UserAclsCard acls={acls} />
    </div>
  );
};

// TODO: remove this component when we update RoleDetails
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 70, refactor later
export const AclPrincipalGroupPermissionsTable = ({ group }: { group: AclPrincipalGroup }) => {
  const entries: {
    type: string;
    selector: string;
    operations: {
      allow: string[];
      deny: string[];
    };
  }[] = [];

  // Convert all entries of the group into a table row
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
};
