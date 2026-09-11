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
import { Link, useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'components/icons';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { InfoIcon } from 'lucide-react';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import type { FC } from 'react';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { type SimpleAcl, useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useDeleteUserMutation, useInvalidateUsersCache, useListUsersQuery } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Code as CodeEl, DefaultSkeleton } from '../../../../utils/tsx-utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../../constants';
import { SearchInput } from '../../../misc/search-input';
import Section from '../../../misc/section';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { filterByName } from '../shared/filter-by-name';
import { SecurityTabsNav } from '../shared/security-tabs-nav';

/** Every ACL bound to this principal on this host, whatever the resource or operation. */
const allAclsFor = (principal: string, host: string): DeleteACLsRequest =>
  create(DeleteACLsRequestSchema, {
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

// Legacy table parity: 50 rows a page, pager only past that. No column-visibility UI, so hiding
// is off at table level. `getRowId` keeps an open row menu on its own principal across a refetch.
const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
  getRowId: (row: SimpleAcl) => `${row.principal}:${row.host}`,
};

// Context, not props, so `columns` closes over nothing and lives at module scope. Queries stay in
// the parent: `useListUsersQuery` auto-fetches every page from an effect, so one per row would too.
type AclRowActionsContextValue = {
  users: { name: string }[];
  canDeleteUsers: boolean;
  deleteAclsForPrincipal: (principal: string, host: string) => Promise<void>;
  deleteUser: (name: string) => Promise<void>;
  invalidateUsers: () => Promise<void>;
  onFailure: (failure: { err: unknown }) => void;
};

const AclRowActionsContext = createContext<AclRowActionsContextValue | null>(null);

const AclRowActions: FC<{ record: SimpleAcl }> = ({ record }) => {
  const ctx = useContext(AclRowActionsContext);
  if (!ctx) {
    return null;
  }
  const { users, canDeleteUsers, deleteAclsForPrincipal, deleteUser, invalidateUsers, onFailure } = ctx;

  // Only a User row may offer the user deletes; a same-named Group would delete an unrelated user.
  const hasAccount = record.principalType === 'User' && users.some((u) => u.name === record.principalName);
  const canDeleteUser = hasAccount && canDeleteUsers;

  const onDelete = async (user: boolean, acls: boolean) => {
    if (acls) {
      try {
        await deleteAclsForPrincipal(record.principal, record.host);
      } catch (err: unknown) {
        // biome-ignore lint/suspicious/noConsole: error logging
        console.error('failed to delete acls', { error: err });
        onFailure({ err });
        // Deleting the account too would orphan the ACLs that just failed to go.
        return;
      }
    }

    if (user) {
      try {
        await deleteUser(record.principalName);
      } catch (err: unknown) {
        // biome-ignore lint/suspicious/noConsole: error logging
        console.error('failed to delete user', { error: err });
        onFailure({ err });
      }
    }

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsers()]);
  };

  const handle = (user: boolean, acls: boolean) => (e: { stopPropagation: () => void }) => {
    onDelete(user, acls).catch(() => {
      // Error handling managed by API layer
    });
    e.stopPropagation();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={`Delete ACL for ${record.principalName}`} size="icon-sm" variant="destructive-ghost">
            <TrashIcon className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem disabled={!canDeleteUser} onClick={handle(true, true)}>
          Delete (User and ACLs)
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canDeleteUser} onClick={handle(true, false)}>
          Delete (User only)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handle(false, true)}>Delete (ACLs only)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const columns: DataTableColumnDef<SimpleAcl>[] = [
  {
    id: 'principal',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
    // Sort on what the cell renders, not the `User:`-prefixed `principal`.
    accessorFn: (row) => row.principalName,
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
          {record.principalType === 'Group' && (
            <Badge tone="default" variant="subtle">
              Group
            </Badge>
          )}
        </span>
      </Link>
    ),
  },
  {
    id: 'host',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Host" />,
    accessorKey: 'host',
    cell: ({
      row: {
        original: { host },
      },
    }) =>
      !host || host === '*' ? (
        <Badge tone="default" variant="subtle">
          Any
        </Badge>
      ) : (
        host
      ),
  },
  {
    id: 'menu',
    header: '',
    enableSorting: false,
    cell: ({ row: { original: record } }) => <AclRowActions record={record} />,
  },
];

const AclsTabContent: FC = () => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);
  const { data: usersData } = useListUsersQuery(undefined, { enabled: isAdminApiConfigured });
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMut } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useNavigate();

  const aclPrincipalGroups =
    principalGroups?.filter((g) => g.principalType === 'User' || g.principalType === 'Group') || [];
  const groups = filterByName(aclPrincipalGroups, searchQuery, (g) => g.principalName);

  const rowActions: AclRowActionsContextValue = {
    users: usersData?.users ?? [],
    canDeleteUsers: Boolean(featureDeleteUser),
    deleteAclsForPrincipal: async (principal, host) => {
      await deleteACLMutation(allAclsFor(principal, host));
      toast.success(
        <span>
          Deleted ACLs for <CodeEl>{principal}</CodeEl>
        </span>
      );
    },
    deleteUser: async (name) => {
      await deleteUserMut({ name });
      toast.success(
        <span>
          Deleted user <CodeEl>{name}</CodeEl>
        </span>
      );
    },
    invalidateUsers: invalidateUsersCache,
    onFailure: setAclFailed,
  };

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
      <SearchInput
        containerClassName="w-[300px]"
        onChange={setSearchQuery}
        placeholder="Filter by name"
        value={searchQuery}
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
          <AclRowActionsContext.Provider value={rowActions}>
            <DataTable<SimpleAcl>
              columns={columns}
              data={groups}
              pagination={groups.length > DEFAULT_TABLE_PAGE_SIZE}
              sorting
              tableOptions={TABLE_OPTIONS}
            />
          </AclRowActionsContext.Provider>
        </div>
      </Section>
    </div>
  );
};

export const AclsTab: FC = () => (
  <>
    <SecurityTabsNav />
    <AclsTabContent />
  </>
);
