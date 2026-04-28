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
import { MoreHorizontalIcon } from 'components/icons';
import { RoleCreateDialog } from 'components/pages/security/roles/role-create-dialog';
import { DeleteRoleConfirmModal } from 'components/pages/security/shared/delete-role-confirm-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import {
  ListLayout,
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutPagination,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { parseAsString, useQueryStates } from 'nuqs';
import { DeleteRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import type { FC } from 'react';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteRoleMutation, useListRolesQuery } from '../../../../react-query/api/security';
import { rolesApi, useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { setPageHeader } from '../../../../state/ui-state';
import { FeatureLicenseNotification } from '../../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../../misc/null-fallback-boundary';
import { Button } from '../../../redpanda-ui/components/button';
import { DataTableColumnHeader, DataTablePagination } from '../../../redpanda-ui/components/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { DescriptionWithHelp } from '../shared/description-with-help';
import { SecurityTabsNav } from '../shared/security-tabs-nav';

type RoleEntry = {
  name: string;
  members: unknown[];
};

const nameFilterFn = (row: Row<RoleEntry>, columnId: string, filterValue: string) => {
  if (!filterValue) return true;
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

export const RolesTab: FC = () => {
  useLayoutEffect(() => {
    setPageHeader('Security', [
      { title: 'Security', linkTo: '/security/users' },
      { title: 'Roles', linkTo: '/security/roles' },
    ]);
  }, []);
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const userData = useApiStoreHook((s) => s.userData);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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

  const { data: rolesData, isError: rolesIsError, error: rolesError } = useListRolesQuery();
  const { mutateAsync: deleteRoleMutation } = useDeleteRoleMutation();

  const rolesWithMembers: RoleEntry[] = (rolesData?.roles ?? []).map((r) => {
    const members = rolesApi.roleMembers.get(r.name) ?? [];
    return { name: r.name, members };
  });

  const pagination = useMemo<PaginationState>(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    [pagination]
  );

  const columns = useMemo<ColumnDef<RoleEntry>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Role name" />,
        cell: ({ row: { original: entry } }) => (
          <Link
            className="text-inherit no-underline hover:no-underline"
            data-testid={`role-list-item-${entry.name}`}
            params={{ roleName: encodeURIComponent(entry.name) }}
            to="/security/roles/$roleName/details"
          >
            {entry.name}
          </Link>
        ),
        filterFn: nameFilterFn,
      },
      {
        id: 'assignedPrincipals',
        header: 'Assigned principals',
        enableSorting: false,
        cell: ({ row: { original: entry } }) => entry.members.length,
      },
      {
        id: 'menu',
        header: '',
        enableSorting: false,
        meta: { align: 'right' as const },
        cell: ({ row: { original: entry } }) => (
          <RoleActions
            memberCount={entry.members.length}
            onDelete={async () => {
              await deleteRoleMutation(create(DeleteRoleRequestSchema, { roleName: entry.name, deleteAcls: true }));
            }}
            roleName={entry.name}
          />
        ),
      },
    ],
    [deleteRoleMutation]
  );

  const table = useReactTable({
    data: rolesWithMembers,
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
    <>
      <SecurityTabsNav />
      <ListLayout>
        <p className="text-muted-foreground text-sm sm:text-base">
          <DescriptionWithHelp short="Groups of ACLs that can be assigned to principals." title="Roles">
            <p>
              Roles are groups of access control lists (ACLs) that can be assigned to principals. A principal represents
              any entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user,
              OIDC identity, or mTLS client).
            </p>
          </DescriptionWithHelp>{' '}
          <NullFallbackBoundary>
            <FeatureLicenseNotification as="badge" featureName="rbac" />
          </NullFallbackBoundary>
        </p>

        <ListLayoutFilters
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="create-role-button"
                  disabled={createRoleDisabled}
                  onClick={() => setCreateDialogOpen(true)}
                >
                  Create role
                </Button>
              </TooltipTrigger>
              {createRoleTooltip && <TooltipContent>{createRoleTooltip}</TooltipContent>}
            </Tooltip>
          }
        >
          <ListLayoutSearchInput
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value || undefined)}
            placeholder="Filter by name (regexp)..."
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          />
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
                    No roles yet.
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

      <RoleCreateDialog onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
    </>
  );
};

const RoleActions = ({
  roleName,
  memberCount,
  onDelete,
}: {
  roleName: string;
  memberCount: number;
  onDelete: () => Promise<void>;
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <DeleteRoleConfirmModal
        numberOfPrincipals={memberCount}
        onConfirm={onDelete}
        onOpenChange={setIsDeleteOpen}
        open={isDeleteOpen}
        roleName={roleName}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid={`role-actions-button-${roleName}`} size="icon-sm" variant="ghost">
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid={`delete-role-button-${roleName}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
