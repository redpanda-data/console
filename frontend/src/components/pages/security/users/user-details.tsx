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

import { Button } from 'components/redpanda-ui/components/button';
import type { UpdateRoleMembershipResponse } from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect, useLayoutEffect, useState } from 'react';

import { UserAclsCard } from './user-acls-card';
import { ChangePasswordModal } from './user-edit-modals';
import { UserRolesCard } from './user-roles-card';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { useListRolesQuery } from '../../../../react-query/api/security';
import { invalidateUsersCache, useDeleteUserMutation, useListUsersQuery } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { api, rolesApi } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { setPageHeader } from '../../../../state/ui-state';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';

type UserDetailsPageProps = {
  userName: string;
};

const formatMechanism = (mechanism?: SASLMechanism): string | null => {
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256) return 'SCRAM-SHA-256';
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512) return 'SCRAM-SHA-512';
  return null;
};

const UserDetailsPage = ({ userName }: UserDetailsPageProps) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: usersData, isLoading: isUsersLoading } = useListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];
  const currentUser = usersData?.users?.find((u) => u.name === userName);
  formatMechanism(currentUser?.mechanism);

  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();

  useLayoutEffect(() => {
    setPageHeader(
      userName,
      [
        { title: 'Security', linkTo: '/security' },
        { title: 'Users', linkTo: '/security/users' },
        { title: userName, linkTo: `/security/users/${userName}/details` },
      ],
      { title: 'Users', linkTo: '/security/users' }
    );
  }, [userName]);

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

  const onConfirmDelete = async () => {
    try {
      await deleteUserMutation({ name: userName });
    } catch {
      return;
    }

    const promises: Promise<UpdateRoleMembershipResponse>[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m) => m.name === userName)) {
        promises.push(rolesApi.updateRoleMembership(roleName, [], [{ name: userName, principalType: 'User' }]));
      }
    }
    await Promise.allSettled(promises);
    await Promise.allSettled([invalidateUsersCache(), rolesApi.refreshRoleMembers()]);
    appGlobal.historyPush('/security/users/');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button onClick={() => setIsChangePasswordModalOpen(true)} variant="outline">
          Change Password
        </Button>
        {Boolean(isServiceAccount) && (
          <Button onClick={() => setIsDeleteModalOpen(true)} variant="destructive">
            Delete User
          </Button>
        )}
      </div>

      <UserPermissionDetailsContent userName={userName} />

      <DeleteUserConfirmModal
        onConfirm={onConfirmDelete}
        onOpenChange={setIsDeleteModalOpen}
        open={isDeleteModalOpen}
        userName={userName}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        setIsOpen={setIsChangePasswordModalOpen}
        userName={userName}
      />
    </div>
  );
};

export default UserDetailsPage;

const UserPermissionDetailsContent = ({ userName }: { userName: string }) => {
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
      <UserRolesCard roles={roles} userName={userName} />
      <UserAclsCard acls={acls} userName={userName} />
    </div>
  );
};
