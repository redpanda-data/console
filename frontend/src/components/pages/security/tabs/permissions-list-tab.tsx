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
import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { TrashIcon } from 'components/icons';
import {
  ListLayout,
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutHeader,
  ListLayoutPagination,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { parseAsString, useQueryStates } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import type { FC } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useDeleteUserMutation, useInvalidateUsersCache } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Code as CodeEl } from '../../../../utils/tsx-utils';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import { DataTableColumnHeader, DataTablePagination } from '../../../redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { type PrincipalEntry, usePrincipalList } from '../hooks/use-principal-list';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { UserRoleTags } from '../shared/user-role-tags';

const nameFilterFn = (row: Row<PrincipalEntry>, columnId: string, filterValue: string) => {
  if (!filterValue) return true;
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

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
  useSecurityBreadcrumbs([{ title: 'Permissions', linkTo: '/security/permissions-list' }]);
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [urlFilterParams, setUrlFilterParams] = useQueryStates({
    name: parseAsString,
  });

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const result: ColumnFiltersState = [];
    if (urlFilterParams.name) {
      result.push({ id: 'name', value: urlFilterParams.name });
    }
    return result;
  }, [urlFilterParams]);

  const handleColumnFiltersChange = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      const nameFilter = next.find((f) => f.id === 'name');
      setUrlFilterParams({
        name: (nameFilter?.value as string) || null,
      });
    },
    [columnFilters, setUrlFilterParams]
  );

  const { principals, isUsersError, usersError, isAclsError, aclsError } = usePrincipalList();

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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
        cell: ({ row: { original: entry } }) => {
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
        filterFn: nameFilterFn,
      },
      {
        id: 'assignedRoles',
        header: 'Permissions',
        enableSorting: false,
        cell: ({ row: { original: entry } }) => (
          <UserRoleTags principalType={entry.principalType} showMaxItems={2} userName={entry.name} />
        ),
      },
      {
        id: 'menu',
        header: '',
        enableSorting: false,
        meta: { align: 'right' as const },
        cell: ({ row: { original: entry } }) => (
          <PermissionsListActions
            canDeleteUser={Boolean(featureDeleteUser) && entry.isScramUser}
            entry={entry}
            key={`${entry.principalType}-${entry.name}`}
            onDelete={onDelete}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [featureDeleteUser]
  );

  const table = useReactTable({
    data: principals,
    columns,
    state: { sorting, pagination, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

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

  return (
    <ListLayout>
      <ListLayoutHeader description="Provides a detailed overview of all effective permissions for each principal, including those derived from assigned roles. While the ACLs tab shows permissions directly granted to principals, this view also incorporates roles that may assign additional permissions. This gives you a complete picture of what each principal can do within your cluster." />

      <ListLayoutFilters>
        <ListLayoutSearchInput
          onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value || undefined)}
          placeholder="Filter by name (regexp)..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        />
      </ListLayoutFilters>

      {aclFailed && <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />}

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
                  No principals yet.
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
  );
};
