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
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { ShieldCheckIcon, Trash2Icon } from 'lucide-react';
import { DeleteRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import type { FC } from 'react';
import { useState } from 'react';
import { columnMeta } from 'utils/data-table-column-meta';
import { docsLinks } from 'utils/docs-links';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteRoleMutation } from '../../../../react-query/api/security';
import { FeatureLicenseNotification } from '../../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../../misc/null-fallback-boundary';
import { Button } from '../../../redpanda-ui/components/button';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  DataTablePagination,
  type DataTableRow,
} from '../../../redpanda-ui/components/data-table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { type RoleEntry, useCreateRoleAvailability, useRoleListData } from '../hooks/use-role-list-data';
import { useNameColumnFilter, useSecurityListTable } from '../hooks/use-security-list-table';
import { useSecurityPageHeader } from '../hooks/use-security-page-header';
import { DescriptionWithHelp } from '../shared/description-with-help';
import { SecurityEmptyState } from '../shared/security-empty-state';
import { SecurityListTable } from '../shared/security-list-table';
import { SecurityTabsNav } from '../shared/security-tabs-nav';

const nameFilterFn = (row: DataTableRow<RoleEntry>, columnId: string, filterValue: string) => {
  if (!filterValue) {
    return true;
  }
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

const ROLE_SKELETON_WIDTHS = { name: 'md', assignedPrincipals: 'sm' } as const;

const roleColumns: DataTableColumnDef<RoleEntry>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Role name" />,
    cell: ({ row: { original: entry } }) => (
      <Link
        data-testid={`role-list-item-${entry.name}`}
        params={{ roleName: encodeURIComponent(entry.name) }}
        search={{ host: undefined }}
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
    meta: columnMeta({ align: 'right' as const }),
    cell: ({ row: { original: entry } }) => <RoleActions memberCount={entry.members.length} roleName={entry.name} />,
  },
];

export const RolesTabNew: FC = () => {
  useSecurityPageHeader('roles');
  const createRole = useCreateRoleAvailability();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { roles, isLoading, isError, error } = useRoleListData();
  const columnFilters = useNameColumnFilter();
  const table = useSecurityListTable(roles, roleColumns, columnFilters);

  if (isError) {
    return <ErrorResult error={error} />;
  }

  const isFiltered = columnFilters.columnFilters.length > 0;

  return (
    <>
      <SecurityTabsNav />
      <ListLayout className="my-4 min-h-0">
        <div className="text-body text-muted-foreground sm:text-body-lg">
          <NullFallbackBoundary>
            <div className="mb-4">
              <FeatureLicenseNotification featureName="rbac" />
            </div>
          </NullFallbackBoundary>
          <DescriptionWithHelp short="Groups of ACLs that can be assigned to principals." title="Roles">
            <div className="text-body">
              Roles are groups of access control lists (ACLs) that can be assigned to principals. A principal represents
              any entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user,
              OIDC identity, or mTLS client).
            </div>
          </DescriptionWithHelp>{' '}
        </div>

        <ListLayoutFilters
          actions={
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    data-testid="create-role-button"
                    disabled={createRole.disabled}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create role
                  </Button>
                }
              />
              {Boolean(createRole.reason) && <TooltipContent>{createRole.reason}</TooltipContent>}
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
          <SecurityListTable
            emptyState={
              <SecurityEmptyState
                action={
                  isFiltered ? undefined : (
                    <Button disabled={createRole.disabled} onClick={() => setCreateDialogOpen(true)}>
                      Create role
                    </Button>
                  )
                }
                description={
                  isFiltered
                    ? 'Try adjusting your filters.'
                    : 'Roles are groups of ACLs that can be assigned to principals. Create one to start managing access control.'
                }
                docsHref={docsLinks.selfManaged.rbac}
                icon={<ShieldCheckIcon />}
                title={isFiltered ? 'No roles match your search' : 'No roles yet'}
              />
            }
            isLoading={isLoading}
            skeletonWidths={ROLE_SKELETON_WIDTHS}
            table={table}
          />
        </ListLayoutContent>

        <DataTablePagination table={table} />
      </ListLayout>
      <RoleCreateDialog onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
    </>
  );
};

const RoleActions = ({ roleName, memberCount }: { roleName: string; memberCount: number }) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { mutateAsync: deleteRoleMutation } = useDeleteRoleMutation();
  const onDelete = async () => {
    await deleteRoleMutation(create(DeleteRoleRequestSchema, { roleName, deleteAcls: true }));
  };

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
        <DropdownMenuTrigger
          render={
            <Button
              data-testid={`role-actions-button-${roleName}`}
              render={
                <button type="button">
                  <MoreHorizontalIcon className="h-4 w-4" />
                </button>
              }
              size="icon-sm"
              variant="ghost"
            />
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid={`delete-role-button-${roleName}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteOpen(true);
            }}
            variant="destructive"
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
