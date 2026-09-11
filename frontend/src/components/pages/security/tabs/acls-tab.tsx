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
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../../react-query/api/acl';
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

type AclPrincipalRow = {
  principal: string;
  host: string;
  principalType: string;
  principalName: string;
};

// Legacy table parity: 50 rows a page, pager only past that. No column-visibility UI, so hiding
// is off at table level.
const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};

/**
 * Owns its own queries so the columns array closes over nothing but the failure setter — a stable
 * array matters because `DataTableColumnHeader` is a dropdown trigger that a re-render destroys.
 */
const AclRowActions: FC<{ record: AclPrincipalRow; onFailure: (failure: { err: unknown }) => void }> = ({
  record,
  onFailure,
}) => {
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const { data: usersData } = useListUsersQuery(undefined, {
    enabled: isRedpandaInfoSuccess && Boolean(redpandaInfo),
  });
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMut } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const userExists = usersData?.users?.some((u) => u.name === record.principalName) ?? false;
  const canDeleteUser = userExists && Boolean(featureDeleteUser);

  const deleteAcls = async () => {
    const deleteRequest: DeleteACLsRequest = create(DeleteACLsRequestSchema, {
      filter: {
        principal: record.principal,
        resourceType: ACL_ResourceType.ANY,
        resourceName: undefined,
        host: record.host,
        operation: ACL_Operation.ANY,
        permissionType: ACL_PermissionType.ANY,
        resourcePatternType: ACL_ResourcePatternType.ANY,
      },
    });
    await deleteACLMutation(deleteRequest);
    toast.success(
      <span>
        Deleted ACLs for <CodeEl>{record.principal}</CodeEl>
      </span>
    );
  };

  const onDelete = async (user: boolean, acls: boolean) => {
    if (acls) {
      try {
        await deleteAcls();
      } catch (err: unknown) {
        // biome-ignore lint/suspicious/noConsole: error logging
        console.error('failed to delete acls', { error: err });
        onFailure({ err });
      }
    }

    if (user) {
      try {
        await deleteUserMut({ name: record.principalName });
        toast.success(
          <span>
            Deleted user <CodeEl>{record.principalName}</CodeEl>
          </span>
        );
      } catch (err: unknown) {
        // biome-ignore lint/suspicious/noConsole: error logging
        console.error('failed to delete user', { error: err });
        onFailure({ err });
      }
    }

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
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
          <Button
            aria-label={`Delete ACL for ${record.principalName}`}
            className="deleteButton"
            size="icon-sm"
            variant="destructive-ghost"
          >
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

const AclsTabContent: FC = () => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useNavigate();

  const aclPrincipalGroups =
    principalGroups?.filter((g) => g.principalType === 'User' || g.principalType === 'Group') || [];
  const groups = filterByName(aclPrincipalGroups, searchQuery, (g) => g.principalName);

  // Built once. A fresh array hands `flexRender` new function identities, which re-creates every
  // header — and `DataTableColumnHeader` is a dropdown trigger, so a re-render would tear an open
  // sort menu down. `setAclFailed` is a stable setter, so there is nothing to depend on.
  const columns: DataTableColumnDef<AclPrincipalRow>[] = useMemo(
    () => [
      {
        id: 'principal',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
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
        cell: ({ row: { original: record } }) => <AclRowActions onFailure={setAclFailed} record={record} />,
      },
    ],
    []
  );

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
      <SearchInput className="w-[300px]" onChange={setSearchQuery} placeholder="Filter by name" value={searchQuery} />
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
          <DataTable<AclPrincipalRow>
            columns={columns}
            data={groups}
            pagination={groups.length > DEFAULT_TABLE_PAGE_SIZE}
            sorting
            tableOptions={TABLE_OPTIONS}
          />
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
