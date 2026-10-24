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

import { Link, useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'components/icons';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { InfoIcon } from 'lucide-react';
import type { FC } from 'react';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { type SimpleAcl, useListACLAsPrincipalGroups } from '../../../../react-query/api/acl';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
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
import { type AclRowActionsContextValue, useAclRowActions } from '../hooks/use-acl-row-actions';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { filterByName } from '../shared/filter-by-name';
import { SecurityTabsNav } from '../shared/security-tabs-nav';

// Legacy table parity: 50 rows a page, pager only past that. No column-visibility UI, so hiding
// is off at table level. `getRowId` keeps an open row menu on its own principal across a refetch.
const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
  getRowId: (row: SimpleAcl) => `${row.principal}:${row.host}`,
};

// Context, not props, so `columns` closes over nothing and lives at module scope.
const AclRowActionsContext = createContext<AclRowActionsContextValue | null>(null);

/** Resolves to whether `action` succeeded; a failure is logged and reported instead of thrown. */
const succeedsOrReports = async (
  action: () => Promise<void>,
  failureMessage: string,
  onFailure: AclRowActionsContextValue['onFailure']
) => {
  try {
    await action();
    return true;
  } catch (err: unknown) {
    // biome-ignore lint/suspicious/noConsole: error logging
    console.error(failureMessage, { error: err });
    onFailure({ err });
    return false;
  }
};

const deleteAclRecord = async (ctx: AclRowActionsContextValue, record: SimpleAcl, user: boolean, acls: boolean) => {
  const { deleteAclsForPrincipal, deleteUser, invalidateUsers, onFailure } = ctx;
  const aclsDeleted =
    !acls ||
    (await succeedsOrReports(
      () => deleteAclsForPrincipal(record.principal, record.host),
      'failed to delete acls',
      onFailure
    ));
  // Deleting the account too would orphan the ACLs that just failed to go.
  if (!aclsDeleted) {
    return;
  }
  if (user) {
    await succeedsOrReports(() => deleteUser(record.principalName), 'failed to delete user', onFailure);
  }
  await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsers()]);
};

const AclRowActions: FC<{ record: SimpleAcl }> = ({ record }) => {
  const ctx = useContext(AclRowActionsContext);
  if (!ctx) {
    return null;
  }
  const { users, canDeleteUsers } = ctx;

  // Only a User row may offer the user deletes; a same-named Group would delete an unrelated user.
  const hasAccount = record.principalType === 'User' && users.some((u) => u.name === record.principalName);
  const canDeleteUser = hasAccount && canDeleteUsers;

  const handle = (user: boolean, acls: boolean) => (e: { stopPropagation: () => void }) => {
    deleteAclRecord(ctx, record, user, acls).catch(() => {
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
        className="cursor-pointer"
        params={{ aclName: record.principalType === 'User' ? record.principalName : record.principal }}
        search={(prev) => ({ ...prev, host: record.host })}
        to="/security/acls/$aclName/details"
      >
        <span className="flex items-center gap-1">
          <span
            className="wrap-break-word whitespace-normal"
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

const getAclPrincipals = (principalGroups: SimpleAcl[], searchQuery: string) =>
  filterByName(
    principalGroups.filter((g) => g.principalType === 'User' || g.principalType === 'Group'),
    searchQuery,
    (g) => g.principalName
  );

type AclsTabBodyProps = {
  principalGroups: SimpleAcl[];
  rowActions: AclRowActionsContextValue;
  aclFailed: { err: unknown } | null;
  onDismissFailure: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

const AclsTabBody = ({
  principalGroups,
  rowActions,
  aclFailed,
  onDismissFailure,
  searchQuery,
  onSearchChange,
}: AclsTabBodyProps) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const navigate = useNavigate();
  const groups = getAclPrincipals(principalGroups, searchQuery);

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
        onChange={onSearchChange}
        placeholder="Filter by name"
        value={searchQuery}
      />
      <Section>
        <AlertDeleteFailed aclFailed={aclFailed} onClose={onDismissFailure} />

        <Button
          data-testid="create-acls"
          onClick={() => {
            navigate({
              to: '/security/acls/create',
              search: { principalType: undefined, principalName: undefined },
            }).catch((error: unknown) => {
              toast.error('Failed to navigate', { description: String(error) });
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

// Page state lives above the error and loading returns so a failed refetch does not reset it.
const AclsTabContent: FC = () => {
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const rowActions = useAclRowActions(setAclFailed);
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();

  if (isError && error) {
    return <ErrorResult error={error} />;
  }

  if (isLoading || !principalGroups) {
    return DefaultSkeleton;
  }

  return (
    <AclsTabBody
      aclFailed={aclFailed}
      onDismissFailure={() => setAclFailed(null)}
      onSearchChange={setSearchQuery}
      principalGroups={principalGroups}
      rowActions={rowActions}
      searchQuery={searchQuery}
    />
  );
};

export const AclsTab: FC = () => (
  <>
    <SecurityTabsNav />
    <AclsTabContent />
  </>
);
