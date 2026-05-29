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
import { useEffect, useState } from 'react';

import { UserAclsCard } from './user-acls-card';
import { UserDetailsPageNew } from './user-details-new';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { UserInformationCard } from './user-information-card';
import { UserRolesCard } from './user-roles-card';
import { isFeatureFlagEnabled } from '../../../../config';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { useListRolesQuery } from '../../../../react-query/api/security';
import { invalidateUsersCache, useDeleteUserMutation, useListUsersQuery } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { api, rolesApi } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { Heading } from '../../../redpanda-ui/components/typography';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';

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
      <Heading className="pt-4 pb-3 font-semibold text-xl" level={2}>
        User: {userName}
      </Heading>
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
                  return;
                }

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

const UserDetailsPageDispatcher = ({ userName }: { userName: string }) =>
  isFeatureFlagEnabled('enableNewSecurityPage') ? (
    <UserDetailsPageNew userName={userName} />
  ) : (
    <UserDetailsPage userName={userName} />
  );

export default UserDetailsPageDispatcher;
