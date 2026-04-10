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

import type { AclPrincipalGroup } from './models';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import { useListRolesQuery } from '../../../react-query/api/security';
import { invalidateUsersCache, useDeleteUserMutation, useListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { useSecurityBreadcrumbs } from '../security/hooks/use-security-breadcrumbs';
import { DeleteUserConfirmModal } from '../security/shared/delete-user-confirm-modal';

type UserDetailsPageProps = {
  userName: string;
};

const UserDetailsPage = ({ userName }: UserDetailsPageProps) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);

  const { data: usersData, isLoading: isUsersLoading } = useListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();

  useSecurityBreadcrumbs([
    { title: 'Users', linkTo: '/security/users' },
    { title: userName, linkTo: `/security/users/${userName}/details` },
  ]);

  useEffect(() => {
    const refreshData = async () => {
      if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
        return;
      }
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), rolesApi.refreshRoles()]);
      await rolesApi.refreshRoleMembers();
    };

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    refreshData().catch(console.error);
    appGlobal.onRefresh = () =>
      // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
      refreshData().catch(console.error);
  }, [userName]);

  if (isUsersLoading) {
    return DefaultSkeleton;
  }

  const isServiceAccount = users.includes(userName);

  return (
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">User: {userName}</h2>
      <div className="flex flex-col gap-4">
        <UserInformationCard
          onEditPassword={() => {
            setIsChangePasswordModalOpen(true);
          }}
          username={userName}
        />
        <UserPermissionDetailsContent
          onChangeRoles={
            featureRolesApi
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
                try {
                  await deleteUserMutation({ name: userName });
                } catch {
                  return; // Error toast shown by mutation's onError
                }

                // Remove user from all its roles (best-effort)
                const promises: Promise<UpdateRoleMembershipResponse>[] = [];
                for (const [roleName, members] of rolesApi.roleMembers) {
                  if (members.any((m) => m.name === userName)) {
                    promises.push(
                      rolesApi.updateRoleMembership(roleName, [], [{ name: userName, principalType: 'User' }])
                    );
                  }
                }
                await Promise.allSettled(promises);
                await Promise.allSettled([invalidateUsersCache(), rolesApi.refreshRoleMembers()]);
                appGlobal.historyPush('/security/users/');
              }}
              userName={userName}
            />
          )}
        </div>

        <ChangePasswordModal
          isOpen={isChangePasswordModalOpen}
          setIsOpen={setIsChangePasswordModalOpen}
          userName={userName}
        />

        {Boolean(featureRolesApi) && (
          <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={userName} />
        )}
      </div>
    </div>
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
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const { data: rolesData } = useListRolesQuery({ filter: { principal: userName } });
  const { data: acls } = useGetAclsByPrincipal(`User:${userName}`);

  const roles = featureRolesApi
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
