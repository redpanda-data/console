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

import { useQuery } from '@connectrpc/connect-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'components/icons';
import {
  ListLayout,
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutHeader,
  ListLayoutPagination,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { ListACLsRequest } from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useDeleteUserMutation, useInvalidateUsersCache, useListUsersQuery } from '../../../../react-query/api/user';
import { rolesApi, useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
} from '../../../redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { TagsValue } from '../../../redpanda-ui/components/tags';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { CreateUserDialog } from '../users/user-create-dialog';
import { ChangePasswordModal, ChangeRolesModal } from '../users/user-edit-modals';

type PrincipalEntry = {
  name: string;
  principalType: 'User' | 'Group';
  isScramUser: boolean;
  mechanism?: SASLMechanism;
};

const mechanismLabel = (mechanism?: SASLMechanism) => {
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512) return 'SCRAM-SHA-512';
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256) return 'SCRAM-SHA-256';
  return null;
};

const nameFilterFn = (row: Row<PrincipalEntry>, columnId: string, filterValue: string) => {
  if (!filterValue) return true;
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

const mechanismFilterFn = (row: Row<PrincipalEntry>, columnId: string, filterValues: string[]) => {
  if (!filterValues?.length) return true;
  return filterValues.includes(String(row.getValue(columnId)));
};

const mechanismOptions = [
  { label: 'SCRAM-SHA-256', value: 'scram-sha-256' },
  { label: 'SCRAM-SHA-512', value: 'scram-sha-512' },
];

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
  useSecurityBreadcrumbs([{ title: 'Users', linkTo: '/security/users' }]);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const userData = useApiStoreHook((s) => s.userData);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createDialogKey, setCreateDialogKey] = useState(0);
  const [urlFilterParams, setUrlFilterParams] = useQueryStates({
    name: parseAsString,
    mechanism: parseAsArrayOf(parseAsString),
  });

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const result: ColumnFiltersState = [];
    if (urlFilterParams.name) {
      result.push({ id: 'name', value: urlFilterParams.name });
    }
    if (urlFilterParams.mechanism?.length) {
      result.push({ id: 'mechanism', value: urlFilterParams.mechanism });
    }
    return result;
  }, [urlFilterParams]);

  const handleColumnFiltersChange = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      const nameFilter = next.find((f) => f.id === 'name');
      const mechanismFilter = next.find((f) => f.id === 'mechanism');
      setUrlFilterParams({
        name: (nameFilter?.value as string) || null,
        mechanism: (mechanismFilter?.value as string[])?.length ? (mechanismFilter?.value as string[]) : null,
      });
    },
    [columnFilters, setUrlFilterParams]
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
    mechanism: u.mechanism,
  }));

  const pagination = useMemo<PaginationState>(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    [pagination]
  );

  const columns = useMemo<ColumnDef<PrincipalEntry>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row: { original: entry } }) => (
          <Link
            className="text-inherit no-underline hover:no-underline"
            params={{ userName: entry.name }}
            to="/security/users/$userName/details"
          >
            {entry.name}
          </Link>
        ),
        filterFn: nameFilterFn,
      },
      {
        id: 'mechanism',
        accessorFn: (entry) => mechanismLabel(entry.mechanism)?.toLowerCase() ?? '',
        header: 'Mechanism',
        enableSorting: false,
        filterFn: mechanismFilterFn,
        cell: ({ row: { original: entry } }) => {
          const label = mechanismLabel(entry.mechanism);
          return label ? (
            <Badge variant="secondary">{label}</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
      },
      {
        id: 'roles',
        header: 'Roles',
        enableSorting: false,
        cell: ({ row: { original: entry } }) => <UserRolesCell userName={entry.name} />,
      },
      {
        id: 'acls',
        header: 'ACLs',
        enableSorting: false,
        cell: ({ row: { original: entry } }) => <UserAclsCell userName={entry.name} />,
      },
      {
        id: 'menu',
        header: '',
        enableSorting: false,
        meta: { align: 'right' as const },
        cell: ({ row: { original: entry } }) => <UserActions user={entry} />,
      },
    ],
    []
  );

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, pagination, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
  });

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
    <>
      <CreateUserDialog key={createDialogKey} onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen} />
      <ListLayout>
        <ListLayoutHeader description="These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication identities (for example, OIDC, mTLS) on the Permissions List page." />

        <ListLayoutFilters
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="create-user-button"
                  disabled={createDisabled}
                  onClick={() => {
                    setCreateDialogKey((k) => k + 1);
                    setIsCreateDialogOpen(true);
                  }}
                >
                  Create user
                </Button>
              </TooltipTrigger>
              {createTooltip && <TooltipContent>{createTooltip}</TooltipContent>}
            </Tooltip>
          }
        >
          <ListLayoutSearchInput
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value || undefined)}
            placeholder="Filter by name (regexp)..."
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          />
          <DataTableFacetedFilter column={table.getColumn('mechanism')} options={mechanismOptions} title="Mechanism" />
        </ListLayoutFilters>

        <ListLayoutContent>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead align={(header.column.columnDef.meta as { align?: 'right' })?.align} key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell align={(cell.column.columnDef.meta as { align?: 'right' })?.align} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={columns.length}>
                    No users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ListLayoutContent>

        <ListLayoutPagination>
          <DataTablePagination table={table} />
        </ListLayoutPagination>
      </ListLayout>
    </>
  );
};

const UserRolesCell = ({ userName }: { userName: string }) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const navigate = useNavigate();

  if (!featureRolesApi) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const roles: string[] = [];
  for (const [roleName, members] of rolesApi.roleMembers) {
    if (
      members.any((m: { name: string; principalType: string }) => m.name === userName && m.principalType === 'User')
    ) {
      roles.push(roleName);
    }
  }

  if (roles.length === 0) {
    return <span className="text-muted-foreground text-sm">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <TagsValue key={r} onClick={() => navigate({ to: `/security/roles/${r}/details` })}>
          {r}
        </TagsValue>
      ))}
    </div>
  );
};

const UserAclsCell = ({ userName }: { userName: string }) => {
  const navigate = useNavigate();
  const { data: aclCount } = useQuery(listACLs, { filter: { principal: `User:${userName}` } } as ListACLsRequest, {
    enabled: !!userName,
    select: (r) => r.resources.length,
  });

  if (!aclCount) {
    return <span className="text-muted-foreground text-sm">None</span>;
  }

  return (
    <TagsValue onClick={() => navigate({ to: `/security/acls/${userName}/details` })}>
      {`${aclCount} ACL${aclCount !== 1 ? 's' : ''}`}
    </TagsValue>
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
