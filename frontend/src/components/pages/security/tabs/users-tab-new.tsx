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

import { Link } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'components/icons';
import { DescriptionWithHelp } from 'components/pages/security/shared/description-with-help';
import {
  ListLayout,
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { KeyRoundIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { columnMeta } from 'utils/data-table-column-meta';
import { docsLinks } from 'utils/docs-links';
import { pluralize } from 'utils/string';

import { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useListRolesQuery } from '../../../../react-query/api/security';
import { useDeleteUserMutation, useInvalidateUsersCache } from '../../../../react-query/api/user';
import { rolesApi } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  type DataTableRow,
} from '../../../redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../../../redpanda-ui/components/popover';
import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { TagsValue } from '../../../redpanda-ui/components/tags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { type RoleAclGroup, useUserPermissions } from '../hooks/use-principal-permissions';
import { useRemountingDialog } from '../hooks/use-remounting-dialog';
import { useSecurityListTable, useUserColumnFilters } from '../hooks/use-security-list-table';
import { useSecurityPageHeader } from '../hooks/use-security-page-header';
import { type UserListEntry, useCreateUserDisabledReason, useUserListData } from '../hooks/use-user-list-data';
import { AclPermissionRow, RoleAclGroupRow } from '../shared/acl-permission-rows';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { removeUserFromAllRoles } from '../shared/role-membership';
import { SecurityEmptyState } from '../shared/security-empty-state';
import { SecurityListTable } from '../shared/security-list-table';
import { SecurityTabsNav } from '../shared/security-tabs-nav';
import { CreateUserDialog } from '../users/user-create-dialog';
import { ChangePasswordModal } from '../users/user-edit-modals';

const mechanismLabel = (mechanism?: SASLMechanism) => {
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512) {
    return 'SCRAM-SHA-512';
  }
  if (mechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256) {
    return 'SCRAM-SHA-256';
  }
  return null;
};

const nameFilterFn = (row: DataTableRow<UserListEntry>, columnId: string, filterValue: string) => {
  if (!filterValue) {
    return true;
  }
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

const mechanismFilterFn = (row: DataTableRow<UserListEntry>, columnId: string, filterValues: string[]) => {
  if (!filterValues?.length) {
    return true;
  }
  return filterValues.includes(String(row.getValue(columnId)));
};

const mechanismOptions = [
  { label: 'SCRAM-SHA-256', value: 'scram-sha-256' },
  { label: 'SCRAM-SHA-512', value: 'scram-sha-512' },
];

const USER_SKELETON_WIDTHS = { name: 'md', mechanism: 'sm', roles: 'sm', acls: 'xs' } as const;

const MechanismCell = ({ mechanism }: { mechanism?: SASLMechanism }) => {
  const label = mechanismLabel(mechanism);
  return label ? (
    <Badge tone="default" variant="subtle">
      {label}
    </Badge>
  ) : (
    <span className="text-body text-muted-foreground">—</span>
  );
};

const userColumns: DataTableColumnDef<UserListEntry>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
    cell: ({ row: { original: entry } }) => (
      <Link params={{ userName: entry.name }} to="/security/users/$userName/details">
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
    cell: ({ row: { original: entry } }) => <MechanismCell mechanism={entry.mechanism} />,
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
    meta: columnMeta({ align: 'right' as const }),
    cell: ({ row: { original: entry } }) => <UserActions user={entry} />,
  },
];

const CreateUserButton = ({
  disabledReason,
  onClick,
  testId,
}: {
  disabledReason: string;
  onClick: () => void;
  testId?: string;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button data-testid={testId} disabled={Boolean(disabledReason)} onClick={onClick}>
            Create user
          </Button>
        }
      />
      {Boolean(disabledReason) && <TooltipContent>{disabledReason}</TooltipContent>}
    </Tooltip>
  </TooltipProvider>
);

export const UsersTabNew: FC = () => {
  useSecurityPageHeader('users');
  const createUserDisabledReason = useCreateUserDisabledReason();
  const createDialog = useRemountingDialog();
  const { users, isLoading, error } = useUserListData();
  const columnFilters = useUserColumnFilters();
  const table = useSecurityListTable(users, userColumns, columnFilters);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const isFiltered = columnFilters.columnFilters.length > 0;

  return (
    <>
      <SecurityTabsNav />
      <CreateUserDialog key={createDialog.key} onOpenChange={createDialog.setOpen} open={createDialog.open} />
      <ListLayout className="my-4 min-h-0">
        <div className="text-body text-muted-foreground sm:text-body-lg">
          <DescriptionWithHelp short="SASL-SCRAM user accounts managed by your cluster." title="Users">
            These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication
            identities (for example, OIDC, mTLS) on the Permissions List page.
          </DescriptionWithHelp>
        </div>

        <ListLayoutFilters
          actions={
            <CreateUserButton
              disabledReason={createUserDisabledReason}
              onClick={createDialog.show}
              testId="create-user-button"
            />
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
          <SecurityListTable
            emptyState={
              <SecurityEmptyState
                action={
                  isFiltered ? undefined : (
                    <CreateUserButton disabledReason={createUserDisabledReason} onClick={createDialog.show} />
                  )
                }
                description={
                  isFiltered
                    ? 'Try adjusting your filters.'
                    : 'SASL-SCRAM user accounts managed by your cluster. Create one to start managing access.'
                }
                docsHref={docsLinks.selfManaged.scramAuthentication}
                icon={<UsersIcon />}
                title={isFiltered ? 'No users match your search' : 'No users yet'}
              />
            }
            isLoading={isLoading}
            skeletonWidths={USER_SKELETON_WIDTHS}
            table={table}
          />
        </ListLayoutContent>

        <DataTablePagination table={table} />
      </ListLayout>
    </>
  );
};

const UserRolesCell = ({ userName }: { userName: string }) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const { data, isLoading } = useListRolesQuery(
    { filter: { principal: `User:${userName}` } },
    { enabled: featureRolesApi }
  );

  if (!featureRolesApi) {
    return <span className="text-body text-muted-foreground">—</span>;
  }

  if (isLoading) {
    return <Skeleton variant="text" width="sm" />;
  }

  const roles = data?.roles ?? [];

  if (roles.length === 0) {
    return <span className="text-body text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Link
          key={r.name}
          params={{ roleName: r.name }}
          search={{ host: undefined }}
          to="/security/roles/$roleName/details"
        >
          <TagsValue>{r.name}</TagsValue>
        </Link>
      ))}
    </div>
  );
};

const UserAclsCell = ({ userName }: { userName: string }) => {
  const [open, setOpen] = useState(false);
  const { directAcls, roleAclGroups, isLoading } = useUserPermissions(userName);
  const total = directAcls.length + roleAclGroups.reduce((s, g) => s + g.acls.length, 0);

  if (!isLoading && total === 0) {
    return <span className="text-body text-muted-foreground">None</span>;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className="m-0.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        render={<Badge render={<button type="button" />} tone="default" variant="subtle" />}
      >
        <span className="leading-tight">{`${directAcls.length} ${pluralize(directAcls.length, 'ACL')}`}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[620px]">
        <Table size="sm" variant="simple">
          <TableHeader>
            <TableRow>
              <TableHead>Resource Type</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Permission</TableHead>
              <TableHead>Host</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {directAcls.map((acl, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: no stable key
              <AclPermissionRow key={i} {...acl} />
            ))}
          </TableBody>
          {roleAclGroups.map((rg: RoleAclGroup) => (
            <TableBody key={rg.roleName}>
              <RoleAclGroupRow colSpan={5} roleName={rg.roleName} />
              {rg.acls.map((acl, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: no stable key
                <AclPermissionRow key={i} {...acl} />
              ))}
            </TableBody>
          ))}
        </Table>
      </PopoverContent>
    </Popover>
  );
};

const UserActions = ({ user }: { user: UserListEntry }) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const invalidateUsersCache = useInvalidateUsersCache();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();

  const onConfirmDelete = async () => {
    try {
      await deleteUserMutation({ name: user.name });
    } catch {
      return; // Error toast shown by mutation's onError
    }
    // Best-effort: a user that still belongs to a role keeps its role-granted access.
    const failures = (await removeUserFromAllRoles(user.name)).filter((r) => r.status === 'rejected');
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
      <DeleteUserConfirmModal
        onConfirm={onConfirmDelete}
        onOpenChange={setIsDeleteModalOpen}
        open={isDeleteModalOpen}
        userName={user.name}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="deleteButton" size="icon-sm" variant="ghost">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsChangePasswordModalOpen(true);
            }}
          >
            <KeyRoundIcon />
            Change password
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteModalOpen(true);
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
