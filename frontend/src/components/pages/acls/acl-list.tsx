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
import { createStandaloneToast, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTableColumnHeader, DataTablePagination } from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from 'components/redpanda-ui/components/hover-card';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { isServerless } from 'config';
import {
  AlertCircle,
  Info,
  Key,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { parseAsString } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { type FC, useEffect, useMemo, useRef, useState } from 'react';

import { DeleteRoleConfirmModal } from './delete-role-confirm-modal';
import { DeleteUserConfirmModal } from './delete-user-confirm-modal';
import type { AclPrincipalGroup } from './models';
import { principalGroupsView } from './models';
import { AclPrincipalGroupEditor } from './principal-group-editor';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { UserRoleTags } from './user-permission-assignments';
import ErrorResult from '../../../components/misc/error-result';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../react-query/api/cluster-status';
import { useInvalidateUsersCache, useLegacyListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import { Code as CodeEl, DefaultSkeleton } from '../../../utils/tsx-utils';
import { FeatureLicenseNotification } from '../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';

// TODO - once AclList is migrated to FC, we could should move this code to use useToast()
const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
    duration: 2000,
  },
});

export type AclListTab = 'users' | 'roles' | 'acls' | 'permissions-list';

type UsersEntry = {
  name: string;
  type: 'SERVICE_ACCOUNT' | 'PRINCIPAL';
  mechanism?: SASLMechanism;
};

const getCreateUserButtonProps = (isAdminApiConfigured: boolean) => {
  const hasRBAC = api.userData?.canManageUsers !== undefined;

  return {
    isDisabled: !(isAdminApiConfigured && Features.createUser) || (hasRBAC && api.userData?.canManageUsers === false),
    tooltip: [
      !isAdminApiConfigured && 'The Redpanda Admin API is not configured.',
      !Features.createUser && "Your cluster doesn't support this feature.",
      hasRBAC &&
        api.userData?.canManageUsers === false &&
        'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
    ]
      .filter(Boolean)
      .join(' '),
  };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ACL list has complex conditional rendering
const AclList: FC<{ tab?: AclListTab }> = ({ tab }) => {
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const invalidateUsersCache = useInvalidateUsersCache();

  useEffect(() => {
    uiState.pageBreadcrumbs = [];
    uiState.pageTitle = 'Access Control';
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });

    appGlobal.onRefresh = async () => {
      await invalidateUsersCache();
    };
  }, [invalidateUsersCache]);

  if (!isRedpandaInfoSuccess) {
    return DefaultSkeleton;
  }

  const usersTabDisabled =
    (!isAdminApiConfigured && 'The Redpanda Admin API is not configured.') ||
    (!Features.createUser && "Your cluster doesn't support this feature.") ||
    (api.userData?.canManageUsers !== undefined &&
      api.userData?.canManageUsers === false &&
      'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.');

  const rolesTabDisabled =
    (!Features.rolesApi && "Your cluster doesn't support this feature.") ||
    (api.userData?.canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.');

  const aclsTabDisabled = api.userData?.canListAcls ? false : 'You do not have the necessary permissions to view ACLs.';

  const permissionsListTabDisabled = api.userData?.canViewPermissionsList
    ? false
    : 'You need (KafkaAclOperation.DESCRIBE and RedpandaCapability.MANAGE_REDPANDA_USERS permissions.';

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <ToastContainer />

        {api.ACLs === null && (
          <Alert icon={<Info className="size-4" />} variant="warning">
            <AlertDescription>You do not have the necessary permissions to view ACLs</AlertDescription>
          </Alert>
        )}
        {api.ACLs?.isAuthorizerEnabled === false && (
          <Alert icon={<Info className="size-4" />} variant="warning">
            <AlertDescription>There's no authorizer configured in your Kafka cluster</AlertDescription>
          </Alert>
        )}

        <Tabs onValueChange={(key) => appGlobal.historyPush(`/security/${key}`)} value={tab || 'acls'}>
          <TabsList>
            <DisableableTab disabled={usersTabDisabled} value="users">
              Users
            </DisableableTab>
            {!isServerless() && (
              <DisableableTab disabled={rolesTabDisabled} value="roles">
                Roles
              </DisableableTab>
            )}
            <DisableableTab disabled={aclsTabDisabled} value="acls">
              ACLs
            </DisableableTab>
            <DisableableTab disabled={permissionsListTabDisabled} value="permissions-list">
              Permissions List
            </DisableableTab>
          </TabsList>

          <TabsContent value="users">
            <UsersTab isAdminApiConfigured={isAdminApiConfigured} />
          </TabsContent>
          {!isServerless() && (
            <TabsContent value="roles">
              <RolesTab />
            </TabsContent>
          )}
          <TabsContent value="acls">
            <AclsTab principalGroups={principalGroupsView.principalGroups} />
          </TabsContent>
          <TabsContent value="permissions-list">
            <PermissionsListTab />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};

export default AclList;

const DisableableTab = ({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled: string | false;
  children: React.ReactNode;
}) => {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <TabsTrigger disabled value={value}>
              {children}
            </TabsTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>{disabled}</TooltipContent>
      </Tooltip>
    );
  }
  return <TabsTrigger value={value}>{children}</TabsTrigger>;
};

const UsersTab = ({ isAdminApiConfigured }: { isAdminApiConfigured: boolean }) => {
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
    isLoading,
  } = useLegacyListUsersQuery(undefined, {
    enabled: isAdminApiConfigured,
  });

  const { data: principalGroupsData } = useListACLAsPrincipalGroups();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const users: UsersEntry[] = useMemo(
    () =>
      (usersData?.users ?? []).map((u) => ({
        name: u.name,
        type: 'SERVICE_ACCOUNT' as const,
        mechanism: u.mechanism,
      })),
    [usersData?.users]
  );

  const usersFiltered = useMemo(
    () =>
      users.filter((u) => {
        const filter = searchQuery;
        if (!filter) {
          return true;
        }
        try {
          const quickSearchRegExp = new RegExp(filter, 'i');
          return u.name.match(quickSearchRegExp);
        } catch {
          return false;
        }
      }),
    [users, searchQuery]
  );

  const aclCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of principalGroupsData ?? []) {
      if (g.principalType === 'User') {
        map.set(g.principalName, (map.get(g.principalName) ?? 0) + 1);
      }
    }
    return map;
  }, [principalGroupsData]);

  const columns: ColumnDef<UsersEntry>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              className="block max-w-[280px] truncate font-medium"
              params={{ userName: row.original.name }}
              to="/security/users/$userName/details"
            >
              {row.original.name}
            </Link>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="break-all font-mono text-xs">{row.original.name}</p>
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'mechanism',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mechanism" />,
      cell: ({ row }) => {
        const m = row.original.mechanism;
        if (m === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256) {
          return (
            <Badge className="font-mono" size="sm" variant="neutral-outline">
              SCRAM-SHA-256
            </Badge>
          );
        }
        if (m === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512) {
          return (
            <Badge className="font-mono" size="sm" variant="neutral-outline">
              SCRAM-SHA-512
            </Badge>
          );
        }
        return (
          <Text as="span" className="text-muted-foreground text-sm">
            Unknown
          </Text>
        );
      },
    },
    ...(Features.rolesApi
      ? ([
          {
            id: 'roles',
            header: 'Roles',
            cell: ({ row }: { row: { original: UsersEntry } }) => (
              <UserRoleTags
                hasAcls={(aclCountMap.get(row.original.name) ?? 0) > 0}
                showMaxItems={2}
                userName={row.original.name}
              />
            ),
          },
        ] as ColumnDef<UsersEntry>[])
      : []),
    {
      id: 'acls',
      header: 'ACLs',
      cell: ({ row }) => {
        const count = aclCountMap.get(row.original.name) ?? 0;
        return <ACLCountBadge count={count} principalName={row.original.name} />;
      },
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => <UserActions user={row.original} />,
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data: usersFiltered,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const createBtnProps = getCreateUserButtonProps(isAdminApiConfigured);

  return (
    <div className="flex flex-col gap-4">
      <Text variant="muted">
        These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication identities
        (for example, OIDC, mTLS) on the Permissions List page.
      </Text>

      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            data-testid="search-field-input"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            value={searchQuery ?? ''}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                data-testid="create-user-button"
                disabled={createBtnProps.isDisabled}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                <Plus className="size-4" /> Create user
              </Button>
            </span>
          </TooltipTrigger>
          {Boolean(createBtnProps.tooltip) && <TooltipContent>{createBtnProps.tooltip}</TooltipContent>}
        </Tooltip>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <UsersTableBody
            colSpan={columns.length}
            createBtnProps={createBtnProps}
            error={error}
            isError={isError}
            isLoading={isLoading}
            table={table}
          />
        </TableBody>
      </Table>

      <DataTablePagination table={table} />
      {usersFiltered.length > 0 && <div className="text-muted-foreground text-sm">{usersFiltered.length} users</div>}
    </div>
  );
};

const UsersTableBody = ({
  isLoading,
  isError,
  error,
  table,
  colSpan,
  createBtnProps,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  table: ReturnType<typeof useReactTable<UsersEntry>>;
  colSpan: number;
  createBtnProps: ReturnType<typeof getCreateUserButtonProps>;
}) => {
  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={colSpan}>
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-muted-foreground">Loading users...</span>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (isError && error) {
    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={colSpan}>
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span>{error.message}</span>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (table.getRowModel().rows.length === 0) {
    return (
      <TableRow>
        <TableCell className="h-32 text-center" colSpan={colSpan}>
          <div className="flex flex-col items-center justify-center gap-2">
            <Users className="size-6 text-muted-foreground" />
            <p className="font-medium">No users yet</p>
            <p className="text-muted-foreground text-sm">Create a user to get started</p>
            <Button
              className="mt-2"
              disabled={Boolean(createBtnProps.isDisabled)}
              onClick={() => appGlobal.historyPush('/security/users/create')}
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" /> Create user
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return table.getRowModel().rows.map((row) => (
    <TableRow
      className="cursor-pointer"
      key={row.id}
      onClick={(e) => {
        // Don't navigate if user clicked on a link, button, or dropdown inside the row
        const target = e.target as HTMLElement;
        if (target.closest('a, button, [role="menuitem"]')) {
          return;
        }
        appGlobal.historyPush(`/security/users/${encodeURIComponent(row.original.name)}/details`);
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
      ))}
    </TableRow>
  ));
};

const ACLCountBadge = ({ principalName, count }: { principalName: string; count: number }) => {
  if (count === 0) {
    return (
      <Text as="span" className="text-muted-foreground text-sm">
        No ACLs
      </Text>
    );
  }
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button type="button">
          <Badge size="sm" variant="neutral-outline">
            {count} {count === 1 ? 'ACL group' : 'ACL groups'}
          </Badge>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64">
        <div className="flex flex-col gap-2">
          <Text as="p" className="font-medium text-sm">
            ACL groups for {principalName}
          </Text>
          <Link className="text-primary text-xs hover:underline" params={{ tab: 'acls' }} to="/security/$tab">
            View all in ACLs tab
          </Link>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const UserActions = ({ user }: { user: UsersEntry }) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const invalidateUsersCache = useInvalidateUsersCache();

  const onConfirmDelete = async (dismiss: (value?: unknown) => void) => {
    await api.deleteServiceAccount(user.name);

    const promises: Promise<unknown>[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m) => m.name === user.name)) {
        promises.push(rolesApi.updateRoleMembership(roleName, [], [user.name]));
      }
    }

    await Promise.allSettled(promises);
    await rolesApi.refreshRoleMembers();
    await invalidateUsersCache();
    dismiss();
  };

  return (
    <>
      {Boolean(api.isAdminApiConfigured) && (
        <ChangePasswordModal
          isOpen={isChangePasswordModalOpen}
          setIsOpen={setIsChangePasswordModalOpen}
          userName={user.name}
        />
      )}
      {Boolean(Features.rolesApi) && (
        <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={user.name} />
      )}
      <DeleteUserConfirmModal
        buttonEl={<button className="hidden" ref={deleteButtonRef} type="button" />}
        onConfirm={onConfirmDelete}
        userName={user.name}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="size-8 p-0" size="icon-sm" variant="ghost">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {Boolean(api.isAdminApiConfigured) && (
            <DropdownMenuItem onSelect={() => setIsChangePasswordModalOpen(true)}>
              <Key className="size-4" /> Change password
            </DropdownMenuItem>
          )}
          {Boolean(Features.rolesApi) && (
            <DropdownMenuItem onSelect={() => setIsChangeRolesModalOpen(true)}>
              <UserCog className="size-4" /> Change roles
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => deleteButtonRef.current?.click()} variant="destructive">
            <Trash2 className="size-4" /> Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

const RolesTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    const refreshData = async () => {
      await rolesApi.refreshRoles();
      await rolesApi.refreshRoleMembers();
    };
    refreshData().catch(() => {
      // Fail silently for now
    });
  }, []);

  const rolesWithMembers = useMemo(() => {
    const filtered = (rolesApi.roles ?? []).filter((u) => {
      const filter = searchQuery;
      if (!filter) {
        return true;
      }
      try {
        const quickSearchRegExp = new RegExp(filter, 'i');
        return u.match(quickSearchRegExp);
      } catch {
        return false;
      }
    });

    return filtered.map((r) => {
      const members = rolesApi.roleMembers.get(r) ?? [];
      return { name: r, members };
    });
  }, [searchQuery]);

  type RoleEntry = (typeof rolesWithMembers)[number];

  const columns: ColumnDef<RoleEntry>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role name" />,
      cell: ({ row }) => (
        <Link
          className="font-medium hover:underline"
          data-testid={`role-list-item-${row.original.name}`}
          params={{ roleName: row.original.name }}
          to="/security/roles/$roleName/details"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'assignedPrincipals',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned principals" />,
      accessorFn: (row) => row.members.length,
      cell: ({ row }) => <>{row.original.members.length}</>,
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      enableSorting: false,
      cell: ({ row }) => <RoleActions entry={row.original} />,
    },
  ];

  const table = useReactTable({
    data: rolesWithMembers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (rolesApi.rolesError) {
    return <ErrorResult error={rolesApi.rolesError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Text variant="muted">
        This tab displays all roles. Roles are groups of access control lists (ACLs) that can be assigned to principals.
        A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a
        SASL-SCRAM user, OIDC identity, or mTLS client).
      </Text>
      <NullFallbackBoundary>
        <FeatureLicenseNotification featureName="rbac" />
      </NullFallbackBoundary>
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            value={searchQuery}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                data-testid="create-role-button"
                disabled={api.userData?.canCreateRoles === false || !Features.rolesApi}
                onClick={() => appGlobal.historyPush('/security/roles/create')}
                variant="outline"
              >
                <Plus className="size-4" /> Create role
              </Button>
            </span>
          </TooltipTrigger>
          {(api.userData?.canCreateRoles === false || !Features.rolesApi) && (
            <TooltipContent>
              {[
                api.userData?.canCreateRoles === false &&
                  'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
                !Features.rolesApi && 'This feature is not enabled.',
              ]
                .filter(Boolean)
                .join(' ')}
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                <span className="text-muted-foreground">No roles found</span>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DataTablePagination table={table} />
    </div>
  );
};

const RoleActions = ({ entry }: { entry: { name: string; members: { name: string }[] } }) => {
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DeleteRoleConfirmModal
        buttonEl={<button className="hidden" ref={deleteButtonRef} type="button" />}
        numberOfPrincipals={entry.members.length}
        onConfirm={async (dismiss) => {
          await rolesApi.deleteRole(entry.name, true);
          await rolesApi.refreshRoles();
          await rolesApi.refreshRoleMembers();
          dismiss();
        }}
        roleName={entry.name}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="size-8 p-0" size="icon-sm" variant="ghost">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => appGlobal.historyPush(`/security/roles/${entry.name}/edit`)}>
            <Pencil className="size-4" /> Edit role
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => deleteButtonRef.current?.click()} variant="destructive">
            <Trash2 className="size-4" /> Delete role
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

const AclsTab = (_: { principalGroups: AclPrincipalGroup[] }) => {
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [edittingPrincipalGroup, setEdittingPrincipalGroup] = useState<AclPrincipalGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

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
    toast({
      status: 'success',
      description: (
        <span>
          Deleted ACLs for <CodeEl>{principal}</CodeEl>
        </span>
      ),
    });
  };

  type AclGroupEntry = {
    principal: string;
    host: string;
    principalType: string;
    principalName: string;
  };

  const tableData: AclGroupEntry[] = useMemo(() => {
    let groups = principalGroups?.filter((g) => g.principalType === 'User') || [];

    try {
      const quickSearchRegExp = new RegExp(searchQuery, 'i');
      groups = groups?.filter((aclGroup) => aclGroup.principalName.match(quickSearchRegExp));
    } catch (_e) {
      // Invalid regex, skip filtering
    }

    return (groups || []).map((g) => ({
      principal: `${g.principalType}:${g.principalName}`,
      host: g.host,
      principalType: g.principalType,
      principalName: g.principalName,
    }));
  }, [principalGroups, searchQuery]);

  const columns: ColumnDef<AclGroupEntry>[] = [
    {
      accessorKey: 'principal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
      cell: ({ row }) => (
        <button
          className="text-left font-medium hover:underline"
          onClick={() => {
            navigate({
              to: `/security/acls/${row.original.principalName}/details`,
              search: (prev) => ({ ...prev, host: row.original.host }),
            });
          }}
          type="button"
        >
          <span
            className="break-words"
            data-testid={`acl-list-item-${row.original.principalName}-${row.original.host}`}
          >
            {row.original.principalName}
          </span>
        </button>
      ),
    },
    {
      accessorKey: 'host',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Host" />,
      cell: ({ row }) =>
        !row.original.host || row.original.host === '*' ? (
          <Badge size="sm" variant="neutral-outline">
            Any
          </Badge>
        ) : (
          row.original.host
        ),
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      enableSorting: false,
      cell: ({ row }) => {
        const record = row.original;
        const userExists = api.serviceAccounts?.users.includes(record.principalName);

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
              toast({
                status: 'success',
                description: (
                  <span>
                    Deleted user <CodeEl>{record.principalName}</CodeEl>
                  </span>
                ),
              });
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
              <Button className="size-8 p-0" size="icon-sm" variant="ghost">
                <Trash2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={!(userExists && Features.deleteUser)}
                onSelect={() => {
                  onDelete(true, true).catch(() => {
                    // Error handling managed by API layer
                  });
                }}
              >
                Delete (User and ACLs)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!(userExists && Features.deleteUser)}
                onSelect={() => {
                  onDelete(true, false).catch(() => {
                    // Error handling managed by API layer
                  });
                }}
              >
                Delete (User only)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onDelete(false, true).catch(() => {
                    // Error handling managed by API layer
                  });
                }}
              >
                Delete (ACLs only)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isError && error) {
    return <ErrorResult error={error} />;
  }

  if (isLoading || !principalGroups) {
    return DefaultSkeleton;
  }

  return (
    <div className="flex flex-col gap-4">
      <Text variant="muted">
        This tab displays all access control lists (ACLs), grouped by principal and host. A principal represents any
        entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user, OIDC
        identity, or mTLS client). The ACLs tab shows only the permissions directly granted to each principal. For a
        complete view of all permissions, including permissions granted through roles, see the Permissions List tab.
      </Text>
      {Boolean(Features.rolesApi) && (
        <Alert icon={<Info className="size-4" />} variant="info">
          <AlertDescription>
            Roles are a more flexible and efficient way to manage user permissions, especially with complex
            organizational hierarchies or large numbers of users.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            value={searchQuery}
          />
        </div>
        <Button
          data-testid="create-acls"
          onClick={() => {
            navigate({
              to: '/security/acls/create',
              search: { principalType: undefined, principalName: undefined },
            });
          }}
        >
          <Plus className="size-4" /> Create ACLs
        </Button>
      </div>

      <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />

      {edittingPrincipalGroup ? (
        <AclPrincipalGroupEditor
          onClose={() => {
            setEdittingPrincipalGroup(null);
            api.refreshAcls(AclRequestDefault, true);
            api.refreshServiceAccounts();
          }}
          principalGroup={edittingPrincipalGroup}
          type="create"
        />
      ) : null}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                <span className="text-muted-foreground">No ACLs found</span>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DataTablePagination table={table} />
    </div>
  );
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: permissions list has complex conditional rendering
const PermissionsListTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

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

  const users: UsersEntry[] = useMemo(() => {
    const result: UsersEntry[] = (usersData?.users ?? []).map((u) => ({
      name: u.name,
      type: 'SERVICE_ACCOUNT' as const,
    }));

    for (const g of principalGroupsData ?? []) {
      if (
        g.principalType === 'User' &&
        !g.principalName.includes('*') &&
        !result.some((u) => u.name === g.principalName)
      ) {
        result.push({ name: g.principalName, type: 'PRINCIPAL' });
      }
    }

    for (const [_, roleMembers] of rolesApi.roleMembers ?? []) {
      for (const roleMember of roleMembers) {
        if (!result.some((u) => u.name === roleMember.name)) {
          result.push({ name: roleMember.name, type: 'PRINCIPAL' });
        }
      }
    }

    return result;
  }, [usersData?.users, principalGroupsData]);

  const usersWithAcls = useMemo(
    () => new Set((principalGroupsData ?? []).filter((g) => g.principalType === 'User').map((g) => g.principalName)),
    [principalGroupsData]
  );

  const usersFiltered = useMemo(
    () =>
      users.filter((u) => {
        const filter = searchQuery;
        if (!filter) {
          return true;
        }
        try {
          const quickSearchRegExp = new RegExp(filter, 'i');
          return u.name.match(quickSearchRegExp);
        } catch {
          return false;
        }
      }),
    [users, searchQuery]
  );

  const columns: ColumnDef<UsersEntry>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
      cell: ({ row }) => (
        <Link
          className="font-medium hover:underline"
          params={{ userName: row.original.name }}
          to="/security/users/$userName/details"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'permissions',
      header: 'Permissions',
      cell: ({ row }) => (
        <UserRoleTags hasAcls={usersWithAcls.has(row.original.name)} showMaxItems={2} userName={row.original.name} />
      ),
    },
  ];

  const table = useReactTable({
    data: usersFiltered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const createBtnProps = getCreateUserButtonProps(isAdminApiConfigured);

  if (isUsersError && usersError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{usersError.message}</AlertDescription>
      </Alert>
    );
  }

  if (isAclsError && aclsError) {
    return <ErrorResult error={aclsError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Text variant="muted">
        This page provides a detailed overview of all effective permissions for each principal, including those derived
        from assigned roles. While the ACLs tab shows permissions directly granted to principals, this tab also
        incorporates roles that may assign additional permissions to a principal. This gives you a complete picture of
        what each principal can do within your cluster.
      </Text>

      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            value={searchQuery}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                disabled={createBtnProps.isDisabled}
                onClick={() => appGlobal.historyPush('/security/users/create')}
                variant="outline"
              >
                <Plus className="size-4" /> Create user
              </Button>
            </span>
          </TooltipTrigger>
          {Boolean(createBtnProps.tooltip) && <TooltipContent>{createBtnProps.tooltip}</TooltipContent>}
        </Tooltip>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                <div className="flex flex-col items-center justify-center gap-2">
                  <span className="text-muted-foreground">No principals yet</span>
                  <Button
                    disabled={createBtnProps.isDisabled}
                    onClick={() => appGlobal.historyPush('/security/users/create')}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="size-4" /> Create user
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DataTablePagination table={table} />
    </div>
  );
};

const AlertDeleteFailed: FC<{
  aclFailed: { err: unknown } | null;
  onClose: () => void;
}> = ({ aclFailed, onClose }) => {
  if (!aclFailed) {
    return null;
  }

  const errorMessage = (() => {
    if (aclFailed.err instanceof Error) {
      return aclFailed.err.message;
    }
    if (typeof aclFailed.err === 'string') {
      return aclFailed.err;
    }
    return 'Unknown error';
  })();

  return (
    <Alert icon={<AlertCircle className="size-4" />} variant="destructive">
      <AlertTitle>Failed to delete</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{errorMessage}</span>
        <Button className="size-6 shrink-0" onClick={onClose} size="icon-sm" variant="ghost">
          &times;
        </Button>
      </AlertDescription>
    </Alert>
  );
};
