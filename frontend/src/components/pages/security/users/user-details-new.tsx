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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { KeyRoundIcon, Trash2Icon } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';

import { UserAclsCardNew } from './user-acls-card-new';
import { ChangePasswordModal } from './user-edit-modals';
import { UserRolesCardNew } from './user-roles-card-new';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { useListRolesQuery } from '../../../../react-query/api/security';
import { invalidateUsersCache, useDeleteUserMutation } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { rolesApi } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { setPageHeader } from '../../../../state/ui-state';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { useRefreshUserAccessData, useScramUserDetails } from '../hooks/use-user-details';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { removeUserFromAllRoles } from '../shared/role-membership';

type UserDetailsPageProps = {
  userName: string;
};

export const UserDetailsPageNew = ({ userName }: UserDetailsPageProps) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { isLoading: isUsersLoading, isServiceAccount, mechanismLabel } = useScramUserDetails(userName);
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

  useRefreshUserAccessData();

  if (isUsersLoading) {
    return DefaultSkeleton;
  }

  const onConfirmDelete = async () => {
    try {
      await deleteUserMutation({ name: userName });
    } catch {
      return;
    }
    await removeUserFromAllRoles(userName);
    await Promise.allSettled([invalidateUsersCache(), rolesApi.refreshRoleMembers()]);
    appGlobal.historyPush('/security/users/');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-body text-secondary">Principal:</span>
          <CopyButton content={`User:${userName}`} size="sm" variant="outline">
            User:{userName}
          </CopyButton>
          {mechanismLabel !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-body text-secondary">Mechanism:</span>
              <Badge size="sm" tone="default" variant="outline">
                {mechanismLabel}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setIsChangePasswordModalOpen(true)} variant="outline">
            <KeyRoundIcon />
            Change Password
          </Button>
          {Boolean(isServiceAccount) && (
            <Button onClick={() => setIsDeleteModalOpen(true)} variant="destructive">
              <Trash2Icon />
              Delete User
            </Button>
          )}
        </div>
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

const UserPermissionDetailsContent = ({ userName }: { userName: string }) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const { data: rolesData, isLoading: isRolesLoading } = useListRolesQuery({ filter: { principal: userName } });
  const { data: acls, isLoading: isAclsLoading } = useGetAclsByPrincipal(`User:${userName}`);

  const roles = featureRolesApi
    ? (rolesData?.roles ?? []).map((r) => ({
        principalType: 'RedpandaRole',
        principalName: r.name,
      }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      {featureRolesApi && <UserRolesCardNew isLoading={isRolesLoading} roles={roles} userName={userName} />}
      <UserAclsCardNew acls={acls} isLoading={isAclsLoading} userName={userName} />
    </div>
  );
};
