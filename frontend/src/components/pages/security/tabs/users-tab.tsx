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

import { DataTable, SearchField } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'components/icons';
import { parseAsString } from 'nuqs';
import type { FC } from 'react';
import { useState } from 'react';

import { useQueryStateWithCallback } from '../../../../hooks/use-query-state-with-callback';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useDeleteUserMutation, useInvalidateUsersCache, useListUsersQuery } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { rolesApi, useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import Section from '../../../misc/section';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { filterByName } from '../shared/filter-by-name';
import { UserRoleTags } from '../shared/user-role-tags';
import { ChangePasswordModal, ChangeRolesModal } from '../users/user-edit-modals';

type PrincipalEntry = { name: string; principalType: 'User' | 'Group'; isScramUser: boolean };

const getCreateUserButtonProps = (
  isAdminApiConfigured: boolean,
  featureCreateUser: boolean,
  canManageUsers: boolean | undefined
) => {
  const hasRBAC = canManageUsers !== undefined;

  return {
    disabled: !(isAdminApiConfigured && featureCreateUser) || (hasRBAC && canManageUsers === false),
    tooltip: [
      !isAdminApiConfigured && 'The Redpanda Admin API is not configured.',
      !featureCreateUser && "Your cluster doesn't support this feature.",
      hasRBAC && canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
    ]
      .filter(Boolean)
      .join(' '),
  };
};

export const UsersTab: FC = () => {
  useSecurityBreadcrumbs([]);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const userData = useApiStoreHook((s) => s.userData);
  const [searchQuery, setSearchQuery] = useQueryStateWithCallback<string>(
    {
      onUpdate: () => {
        // Query state is managed by the URL
      },
      getDefaultValue: () => '',
    },
    'q',
    parseAsString.withDefault('')
  );
  const {
    data: usersData,
    isError,
    error,
  } = useListUsersQuery(undefined, {
    enabled: isAdminApiConfigured,
  });

  const users: PrincipalEntry[] = (usersData?.users ?? []).map((u) => ({
    name: u.name,
    principalType: 'User' as const,
    isScramUser: true,
  }));

  const usersFiltered = filterByName(users, searchQuery, (u) => u.name);

  if (isError && error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const { disabled: createDisabled, tooltip: createTooltip } = getCreateUserButtonProps(
    isAdminApiConfigured,
    featureCreateUser,
    userData?.canManageUsers
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication identities
        (for example, OIDC, mTLS) on the Permissions List page.
      </div>

      <SearchField
        data-testid="search-field-input"
        placeholderText="Filter by name"
        searchText={searchQuery ?? ''}
        setSearchText={(x) => setSearchQuery(x)}
        width="300px"
      />

      <Section>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="create-user-button"
                disabled={createDisabled}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                Create user
              </Button>
            </TooltipTrigger>
            {createTooltip && <TooltipContent>{createTooltip}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>

        <div className="my-4">
          <DataTable<PrincipalEntry>
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'User',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <Link
                      className="text-inherit no-underline hover:no-underline"
                      params={{ userName: entry.name }}
                      to="/security/users/$userName"
                    >
                      {entry.name}
                    </Link>
                  );
                },
              },
              {
                id: 'assignedRoles',
                header: 'Permissions',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return <UserRoleTags showMaxItems={2} userName={entry.name} />;
                },
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return <UserActions user={entry} />;
                },
              },
            ]}
            data={usersFiltered}
            emptyAction={
              <Button
                disabled={createDisabled}
                onClick={() => appGlobal.historyPush('/security/users/create')}
                variant="outline"
              >
                Create user
              </Button>
            }
            emptyText="No users yet"
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};

const UserActions = ({ user }: { user: PrincipalEntry }) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const invalidateUsersCache = useInvalidateUsersCache();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();

  const onConfirmDelete = async () => {
    try {
      await deleteUserMutation({ name: user.name });
    } catch {
      return; // Error toast shown by mutation's onError
    }

    // Remove user from all its roles (best-effort)
    const promises: Promise<unknown>[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m: { name: string }) => m.name === user.name)) {
        promises.push(rolesApi.updateRoleMembership(roleName, [], [{ name: user.name, principalType: 'User' }]));
      }
    }

    const results = await Promise.allSettled(promises);
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      // biome-ignore lint/suspicious/noConsole: error logging
      console.error(`Failed to remove user from ${failures.length} role(s)`, failures);
    }

    await Promise.all([rolesApi.refreshRoleMembers(), invalidateUsersCache()]);
  };

  return (
    <>
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        setIsOpen={setIsChangePasswordModalOpen}
        userName={user.name}
      />
      {Boolean(featureRolesApi) && (
        <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={user.name} />
      )}
      <DeleteUserConfirmModal
        onConfirm={onConfirmDelete}
        onOpenChange={setIsDeleteModalOpen}
        open={isDeleteModalOpen}
        userName={user.name}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="deleteButton" size="icon-sm" variant="ghost">
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsChangePasswordModalOpen(true);
            }}
          >
            Change password
          </DropdownMenuItem>
          {Boolean(featureRolesApi) && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsChangeRolesModalOpen(true);
              }}
            >
              Change roles
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteModalOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
