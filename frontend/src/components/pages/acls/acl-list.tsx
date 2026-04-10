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
import { DataTable, SearchField, Tabs } from '@redpanda-data/ui';
import type { TabsItemProps } from '@redpanda-data/ui/dist/components/Tabs/Tabs';
import { Link, useNavigate } from '@tanstack/react-router';
import { EditIcon, MoreHorizontalIcon, TrashIcon } from 'components/icons';
import { isServerless } from 'config';
import { InfoIcon, X } from 'lucide-react';
import { parseAsString } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { DeleteRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { type FC, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { DeleteRoleConfirmModal } from './delete-role-confirm-modal';
import { DeleteUserConfirmModal } from './delete-user-confirm-modal';
import type { AclPrincipalGroup } from './models';
import { principalGroupsView } from './models';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { UserRoleTags } from './user-permission-assignments';
import ErrorResult from '../../../components/misc/error-result';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../react-query/api/cluster-status';
import { useDeleteRoleMutation, useListRolesQuery } from '../../../react-query/api/security';
import { useInvalidateUsersCache, useLegacyListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi, useApiStoreHook } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import { Code as CodeEl, DefaultSkeleton } from '../../../utils/tsx-utils';
import { FeatureLicenseNotification } from '../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../redpanda-ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';

// TODO - once AclList is migrated to FC, we could should move this code to use useToast()
/** Filters items by name using a case-insensitive regex match (falls back to substring if the query is an invalid regex). Returns all items if the query is empty. */
function filterByName<T>(items: T[], query: string, getName: (item: T) => string): T[] {
  if (!query) {
    return items;
  }
  try {
    const re = new RegExp(query, 'i'); // nosemgrep: detect-non-literal-regexp -- client-side UI filter, user only affects their own session
    return items.filter((item) => re.test(getName(item)));
  } catch {
    const lowerQuery = query.toLowerCase();
    return items.filter((item) => getName(item).toLowerCase().includes(lowerQuery));
  }
}

export type AclListTab = 'users' | 'roles' | 'acls' | 'permissions-list';

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ACL list has complex conditional rendering
const AclList: FC<{ tab?: AclListTab }> = ({ tab }) => {
  // Check if Redpanda Admin API is configured using React Query
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  // Admin API is configured if the query succeeded and returned data (even if it's an empty object)
  // This matches the MobX logic where api.isAdminApiConfigured checks if clusterOverview.redpanda !== null
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const userData = useApiStoreHook((s) => s.userData);
  const acls = useApiStoreHook((s) => s.ACLs);

  const { data: usersData, isLoading: isUsersLoading } = useLegacyListUsersQuery(undefined, {
    enabled: isAdminApiConfigured,
  });

  // Set up page title and breadcrumbs
  useEffect(() => {
    uiState.pageBreadcrumbs = [];
    uiState.pageTitle = 'Access Control';
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });

    // Set up refresh handler
    const refreshData = async () => {
      await Promise.allSettled([api.refreshClusterOverview(), rolesApi.refreshRoles(), api.refreshUserData()]);
      await rolesApi.refreshRoleMembers();
    };

    appGlobal.onRefresh = async () => {
      await refreshData();
    };

    // Initial data load
    refreshData().catch(() => {
      // Fail silently for now
    });
  }, []);

  // Note: Redirect from /security/ to /security/users is now handled at route level
  // in src/routes/security/index.tsx using beforeLoad to prevent navigation loops
  // in embedded mode where shell and console routers can conflict.

  if (isUsersLoading && !usersData?.users?.length) {
    return DefaultSkeleton;
  }

  const warning =
    acls === null ? (
      <Alert className="mb-4" variant="warning">
        <AlertDescription>You do not have the necessary permissions to view ACLs</AlertDescription>
      </Alert>
    ) : null;

  const noAclAuthorizer =
    acls?.isAuthorizerEnabled === false ? (
      <Alert className="mb-4" variant="warning">
        <AlertDescription>There's no authorizer configured in your Kafka cluster</AlertDescription>
      </Alert>
    ) : null;

  const tabs = [
    {
      key: 'users' as AclListTab,
      name: 'Users',
      component: <UsersTab data-testid="users-tab" isAdminApiConfigured={isAdminApiConfigured} />,
      isDisabled:
        (!isAdminApiConfigured && 'The Redpanda Admin API is not configured.') ||
        (!featureCreateUser && "Your cluster doesn't support this feature.") ||
        (userData?.canManageUsers !== undefined &&
          userData?.canManageUsers === false &&
          'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
    },
    isServerless()
      ? null
      : {
          key: 'roles' as AclListTab,
          name: 'Roles',
          component: <RolesTab data-testid="roles-tab" />,
          isDisabled:
            (!featureRolesApi && "Your cluster doesn't support this feature.") ||
            (userData?.canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
        },
    {
      key: 'acls' as AclListTab,
      name: 'ACLs',
      component: <AclsTab data-testid="acls-tab" principalGroups={principalGroupsView.principalGroups} />,
      isDisabled: userData?.canListAcls ? false : 'You do not have the necessary permissions to view ACLs.',
    },
    {
      key: 'permissions-list' as AclListTab,
      name: 'Permissions List',
      component: <PermissionsListTab data-testid="permissions-list-tab" />,
      isDisabled: userData?.canViewPermissionsList
        ? false
        : 'You need (KafkaAclOperation.DESCRIBE and RedpandaCapability.MANAGE_REDPANDA_USERS permissions.',
    },
  ].filter((x) => x !== null) as TabsItemProps[];

  const activeTab = tabs.findIndex((x) => x.key === tab);

  return (
    <>
      {warning}
      {noAclAuthorizer}

      <PageContent>
        <Tabs
          index={activeTab >= 0 ? activeTab : 0}
          items={tabs}
          onChange={(_, key) => {
            appGlobal.historyPush(`/security/${key}`);
          }}
        />
      </PageContent>
    </>
  );
};

export default AclList;

type PrincipalEntry = { name: string; principalType: 'User' | 'Group'; isScramUser: boolean };

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: permissions list has complex conditional rendering
const PermissionsListTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const userData = useApiStoreHook((s) => s.userData);
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  // Check if Redpanda Admin API is configured using React Query
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const {
    data: usersData,
    isError: isUsersError,
    error: usersError,
  } = useLegacyListUsersQuery(undefined, {
    enabled: isAdminApiConfigured,
  });

  const { data: principalGroupsData, isError: isAclsError, error: aclsError } = useListACLAsPrincipalGroups();

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
        await api.deleteServiceAccount(entry.name);
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

  // Check for errors from both queries
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

  const scramUserNames = new Set((usersData?.users ?? []).map((u) => u.name));

  const users: PrincipalEntry[] = (usersData?.users ?? []).map((u) => ({
    name: u.name,
    principalType: 'User' as const,
    isScramUser: true,
  }));

  // Add principals referenced by ACLs that are not already listed as SCRAM users
  for (const g of principalGroupsData ?? []) {
    if (
      (g.principalType === 'User' || g.principalType === 'Group') &&
      !g.principalName.includes('*') &&
      !users.any((u) => u.name === g.principalName && u.principalType === g.principalType)
    ) {
      users.push({
        name: g.principalName,
        principalType: g.principalType as 'User' | 'Group',
        isScramUser: scramUserNames.has(g.principalName),
      });
    }
  }

  for (const [_, roleMembers] of rolesApi.roleMembers ?? []) {
    for (const roleMember of roleMembers) {
      if (!users.any((u) => u.name === roleMember.name)) {
        users.push({ name: roleMember.name, principalType: 'User', isScramUser: scramUserNames.has(roleMember.name) });
      }
    }
  }

  const usersFiltered = filterByName(users, searchQuery, (u) => u.name);

  return (
    <div className="flex flex-col gap-4">
      <div>
        This page provides a detailed overview of all effective permissions for each principal, including those derived
        from assigned roles. While the ACLs tab shows permissions directly granted to principals, this tab also
        incorporates roles that may assign additional permissions to a principal. This gives you a complete picture of
        what each principal can do within your cluster.
      </div>

      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
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
                      to="/security/users/$userName/details"
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
                    {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
            emptyText="No principals yet"
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};

const UsersTab = ({ isAdminApiConfigured }: { isAdminApiConfigured: boolean }) => {
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
  } = useLegacyListUsersQuery(undefined, {
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
                      to="/security/users/$userName/details"
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

  const onConfirmDelete = async () => {
    await api.deleteServiceAccount(user.name);

    // Remove user from all its roles
    const promises: Promise<unknown>[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m) => m.name === user.name)) {
        // is this user part of this role?
        // then remove it
        promises.push(rolesApi.updateRoleMembership(roleName, [], [{ name: user.name, principalType: 'User' }]));
      }
    }

    await Promise.allSettled(promises);
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

const RolesTab = () => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const userData = useApiStoreHook((s) => s.userData);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: rolesData, isError: rolesIsError, error: rolesError } = useListRolesQuery();
  const { mutateAsync: deleteRoleMutation } = useDeleteRoleMutation();

  const roles = filterByName(rolesData?.roles ?? [], searchQuery, (r) => r.name);

  const rolesWithMembers = roles.map((r) => {
    const members = rolesApi.roleMembers.get(r.name) ?? [];
    return { name: r.name, members };
  });

  if (rolesIsError) {
    return <ErrorResult error={rolesError} />;
  }

  const createRoleDisabled = userData?.canCreateRoles === false || !featureRolesApi;
  const createRoleTooltip = [
    userData?.canCreateRoles === false &&
      'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
    !featureRolesApi && 'This feature is not enabled.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-4">
      <div>
        This tab displays all roles. Roles are groups of access control lists (ACLs) that can be assigned to principals.
        A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a
        SASL-SCRAM user, OIDC identity, or mTLS client).
      </div>
      <NullFallbackBoundary>
        <FeatureLicenseNotification featureName="rbac" />
      </NullFallbackBoundary>
      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
        width="300px"
      />
      <Section>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="create-role-button"
                disabled={createRoleDisabled}
                onClick={() => appGlobal.historyPush('/security/roles/create')}
                variant="outline"
              >
                Create role
              </Button>
            </TooltipTrigger>
            {createRoleTooltip && <TooltipContent>{createRoleTooltip}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>

        <div className="my-4">
          <DataTable
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Role name',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <Link
                      className="text-inherit no-underline hover:no-underline"
                      data-testid={`role-list-item-${entry.name}`}
                      params={{ roleName: encodeURIComponent(entry.name) }}
                      to="/security/roles/$roleName/details"
                    >
                      {entry.name}
                    </Link>
                  );
                },
              },
              {
                id: 'assignedPrincipals',
                header: 'Assigned principals',
                cell: (ctx) => <>{ctx.row.original.members.length}</>,
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <div className="flex flex-row gap-4">
                      <Button
                        aria-label={`Edit role ${entry.name}`}
                        data-testid={`edit-role-button-${entry.name}`}
                        onClick={() => {
                          appGlobal.historyPush(`/security/roles/${encodeURIComponent(entry.name)}/update`);
                        }}
                        size="icon-sm"
                        variant="secondary-ghost"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <DeleteRoleConfirmModal
                        buttonEl={
                          <Button
                            aria-label={`Delete role ${entry.name}`}
                            data-testid={`delete-role-button-${entry.name}`}
                            size="icon-sm"
                            variant="destructive-ghost"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        }
                        numberOfPrincipals={entry.members.length}
                        onConfirm={async () => {
                          await deleteRoleMutation(
                            create(DeleteRoleRequestSchema, { roleName: entry.name, deleteAcls: true })
                          );
                        }}
                        roleName={entry.name}
                      />
                    </div>
                  );
                },
              },
            ]}
            data={rolesWithMembers}
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};

const AclsTab = (_: { principalGroups: AclPrincipalGroup[] }) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);
  const { data: usersData } = useLegacyListUsersQuery(undefined, { enabled: isAdminApiConfigured });
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useNavigate();

  const deleteACLsForPrincipal = async (principal: string, host: string) => {
    const deleteRequest: DeleteACLsRequest = create(DeleteACLsRequestSchema, {
      filter: {
        principal,
        resourceType: ACL_ResourceType.ANY,
        resourceName: undefined,
        host,
        operation: ACL_Operation.ANY,
        permissionType: ACL_PermissionType.ANY,
        resourcePatternType: ACL_ResourcePatternType.ANY,
      },
    });
    await deleteACLMutation(deleteRequest);
    toast.success(
      <span>
        Deleted ACLs for <CodeEl>{principal}</CodeEl>
      </span>
    );
  };

  const aclPrincipalGroups =
    principalGroups?.filter((g) => g.principalType === 'User' || g.principalType === 'Group') || [];
  const groups = filterByName(aclPrincipalGroups, searchQuery, (g) => g.principalName);

  if (isError && error) {
    return <ErrorResult error={error} />;
  }

  if (isLoading || !principalGroups) {
    return DefaultSkeleton;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        This tab displays all access control lists (ACLs), grouped by principal and host. A principal represents any
        entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user, OIDC
        identity, or mTLS client). The ACLs tab shows only the permissions directly granted to each principal. For a
        complete view of all permissions, including permissions granted through roles, see the Permissions List tab.
      </div>
      {Boolean(featureRolesApi) && (
        <Alert icon={<InfoIcon />} variant="warning">
          <AlertDescription>
            Roles are a more flexible and efficient way to manage user permissions, especially with complex
            organizational hierarchies or large numbers of users.
          </AlertDescription>
        </Alert>
      )}
      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
        width="300px"
      />
      <Section>
        <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />

        <Button
          data-testid="create-acls"
          onClick={() => {
            navigate({
              to: '/security/acls/create',
              search: { principalType: undefined, principalName: undefined },
            });
          }}
        >
          Create ACLs
        </Button>

        <div className="py-4">
          <DataTable<{
            principal: string;
            host: string;
            principalType: string;
            principalName: string;
          }>
            columns={[
              {
                size: Number.POSITIVE_INFINITY,
                header: 'Principal',
                accessorKey: 'principal',
                cell: ({ row: { original: record } }) => (
                  <Link
                    className="cursor-pointer no-underline hover:text-primary"
                    params={{ aclName: record.principalType === 'User' ? record.principalName : record.principal }}
                    search={(prev) => ({ ...prev, host: record.host })}
                    to="/security/acls/$aclName/details"
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className="whitespace-normal break-words"
                        data-testid={`acl-list-item-${record.principalName}-${record.host}`}
                      >
                        {record.principalName}
                      </span>
                      {record.principalType === 'Group' && <Badge variant="neutral">Group</Badge>}
                    </span>
                  </Link>
                ),
              },
              {
                header: 'Host',
                accessorKey: 'host',
                cell: ({
                  row: {
                    original: { host },
                  },
                }) => (!host || host === '*' ? <Badge variant="neutral">Any</Badge> : host),
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: ({ row: { original: record } }) => {
                  const userExists = usersData?.users?.some((u) => u.name === record.principalName) ?? false;

                  const onDelete = async (user: boolean, acls: boolean) => {
                    if (acls) {
                      try {
                        await deleteACLsForPrincipal(record.principal, record.host);
                      } catch (err: unknown) {
                        // biome-ignore lint/suspicious/noConsole: error logging
                        console.error('failed to delete acls', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    if (user) {
                      try {
                        await api.deleteServiceAccount(record.principalName);
                        toast.success(
                          <span>
                            Deleted user <CodeEl>{record.principalName}</CodeEl>
                          </span>
                        );
                      } catch (err: unknown) {
                        // biome-ignore lint/suspicious/noConsole: error logging
                        console.error('failed to delete acls', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
                  };

                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="deleteButton" size="icon-sm" variant="destructive-ghost">
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          disabled={!(userExists && featureDeleteUser)}
                          onClick={(e) => {
                            onDelete(true, true).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (User and ACLs)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!(userExists && featureDeleteUser)}
                          onClick={(e) => {
                            onDelete(true, false).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (User only)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            onDelete(false, true).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (ACLs only)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                },
              },
            ]}
            data={groups}
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};

const AlertDeleteFailed: FC<{
  aclFailed: { err: unknown } | null;
  onClose: () => void;
}> = ({ aclFailed, onClose }) => {
  const ref = useRef(null);

  if (!aclFailed) {
    return null;
  }

  return (
    <Alert className="relative mb-4" ref={ref} variant="destructive">
      <AlertTitle>Failed to delete</AlertTitle>
      <AlertDescription>
        {(() => {
          if (aclFailed.err instanceof Error) {
            return aclFailed.err.message;
          }
          if (typeof aclFailed.err === 'string') {
            return aclFailed.err;
          }
          return 'Unknown error';
        })()}
      </AlertDescription>
      <Button className="absolute top-2 right-2" onClick={onClose} size="icon-sm" variant="ghost">
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
};
