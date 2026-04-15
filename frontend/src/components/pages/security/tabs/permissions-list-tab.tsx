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

import { create } from '@bufbuild/protobuf';
import { DataTable, SearchField } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { InfoIcon, TrashIcon } from 'components/icons';
import { parseAsString } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import type { FC } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { useQueryStateWithCallback } from '../../../../hooks/use-query-state-with-callback';
import { useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useDeleteUserMutation, useInvalidateUsersCache } from '../../../../react-query/api/user';
import { appGlobal } from '../../../../state/app-global';
import { api, useApiStoreHook } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Code as CodeEl } from '../../../../utils/tsx-utils';
import Section from '../../../misc/section';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { type PrincipalEntry, usePrincipalList } from '../hooks/use-principal-list';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { getCreateUserButtonProps } from '../shared/create-user-button-props';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { filterByName } from '../shared/filter-by-name';
import { UserRoleTags } from '../shared/user-role-tags';

const PermissionsListActions = ({
  entry,
  canDeleteUser,
  onDelete,
}: {
  entry: PrincipalEntry;
  canDeleteUser: boolean;
  onDelete: (entry: PrincipalEntry, deleteUser: boolean, deleteAcls: boolean) => Promise<void>;
}) => {
  const [pendingAction, setPendingAction] = useState<'user-and-acls' | 'user-only' | null>(null);

  return (
    <>
      <DeleteUserConfirmModal
        onConfirm={async () => {
          if (pendingAction === 'user-and-acls') await onDelete(entry, true, true);
          if (pendingAction === 'user-only') await onDelete(entry, true, false);
        }}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        open={pendingAction !== null}
        userName={entry.name}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="destructive-ghost">
            <TrashIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {entry.principalType !== 'Group' && (
            <>
              <DropdownMenuItem
                data-testid="delete-user-and-acls"
                disabled={!canDeleteUser}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingAction('user-and-acls');
                }}
              >
                Delete (User and ACLs)
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="delete-user-only"
                disabled={!canDeleteUser}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingAction('user-only');
                }}
              >
                Delete (User only)
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            data-testid="delete-acls-only"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(entry, false, true).catch(() => {});
            }}
          >
            Delete (ACLs only)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export const PermissionsListTab: FC = () => {
  useSecurityBreadcrumbs([]);
  const [searchQuery, setSearchQuery] = useQueryStateWithCallback<string>(
    { onUpdate: () => {}, getDefaultValue: () => '' },
    'q',
    parseAsString.withDefault('')
  );
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const userData = useApiStoreHook((s) => s.userData);
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const { principals, isAdminApiConfigured, isUsersError, usersError, isAclsError, aclsError } = usePrincipalList();

  const deleteACLsForPrincipal = async (principalName: string, principalType: 'User' | 'Group' = 'User') => {
    const deleteRequest = create(DeleteACLsRequestSchema, {
      filter: {
        principal: `${principalType}:${principalName}`,
        resourceType: ACL_ResourceType.ANY,
        resourceName: undefined,
        host: undefined,
        operation: ACL_Operation.ANY,
        permissionType: ACL_PermissionType.ANY,
        resourcePatternType: ACL_ResourcePatternType.ANY,
      },
    });
    await deleteACLMutation(deleteRequest);
    toast.success(
      <span>
        Deleted ACLs for <CodeEl>{principalName}</CodeEl>
      </span>
    );
  };

  // Best-effort delete: ACL and user deletions are independent operations.
  // If ACL deletion fails, we still attempt user deletion (and vice versa).
  // Any failure is surfaced via the AlertDeleteFailed banner.
  const onDelete = async (entry: PrincipalEntry, deleteUser: boolean, deleteAcls: boolean) => {
    if (deleteAcls) {
      try {
        await deleteACLsForPrincipal(entry.name, entry.principalType);
      } catch (err: unknown) {
        setAclFailed({ err });
      }
    }
    if (deleteUser) {
      try {
        await deleteUserMutation({ name: entry.name });
        toast.success(
          <span>
            Deleted user <CodeEl>{entry.name}</CodeEl>
          </span>
        );
      } catch (err: unknown) {
        setAclFailed({ err });
      }
    }
    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
  };

  if (isUsersError && usersError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{usersError.message}</AlertDescription>
      </Alert>
    );
  }

  if (isAclsError && aclsError) {
    return <ErrorResult error={aclsError} />;
  }

  const usersFiltered = filterByName(principals, searchQuery, (u) => u.name);

  return (
    <div className="flex flex-col gap-4">
      <p>
        This page provides a detailed overview of all effective permissions for each principal, including those derived
        from assigned roles. While the ACLs tab shows permissions directly granted to principals, this tab also
        incorporates roles that may assign additional permissions to a principal. This gives you a complete picture of
        what each principal can do within your cluster.
      </p>
      <Alert icon={<InfoIcon />} variant="info">
        <AlertDescription>
          <p>
            To grant permissions, use the{' '}
            <Link className="font-medium underline" to="/security/acls">
              ACLs
            </Link>{' '}
            or{' '}
            <Link className="font-medium underline" to="/security/roles">
              Roles
            </Link>{' '}
            tabs.
          </p>
        </AlertDescription>
      </Alert>

      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery ?? ''}
        setSearchText={(x) => setSearchQuery(x)}
        width="300px"
      />

      <Section>
        <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />
        <div className="my-4">
          <DataTable<PrincipalEntry>
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Principal',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  if (entry.principalType === 'Group') {
                    return (
                      <Link
                        className="text-inherit no-underline hover:no-underline"
                        params={{ aclName: `Group:${entry.name}` }}
                        search={{ host: undefined }}
                        to="/security/acls/$aclName/details"
                      >
                        <span className="flex items-center gap-1">
                          {entry.name}
                          <Badge variant="neutral">Group</Badge>
                        </span>
                      </Link>
                    );
                  }
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
                  return <UserRoleTags principalType={entry.principalType} showMaxItems={2} userName={entry.name} />;
                },
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: ({ row: { original: entry } }) => (
                  <PermissionsListActions
                    canDeleteUser={Boolean(featureDeleteUser) && entry.isScramUser}
                    entry={entry}
                    key={`${entry.principalType}-${entry.name}`}
                    onDelete={onDelete}
                  />
                ),
              },
            ]}
            data={usersFiltered}
            emptyAction={(() => {
              if (searchQuery) return;
              const { disabled, tooltip } = getCreateUserButtonProps(
                isAdminApiConfigured,
                featureCreateUser,
                userData?.canManageUsers
              );
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={disabled}
                        onClick={() => appGlobal.historyPush('/security/users/create')}
                        variant="outline"
                      >
                        Create user
                      </Button>
                    </TooltipTrigger>
                    {Boolean(tooltip) && <TooltipContent>{tooltip}</TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
            emptyText={searchQuery ? 'No principals match your search' : 'No principals yet'}
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};
