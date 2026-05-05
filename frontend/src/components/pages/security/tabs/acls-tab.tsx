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
import { DataTable, SearchField } from '@redpanda-data/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'components/icons';
import { isFeatureFlagEnabled } from 'config';
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
import { useState } from 'react';
import { toast } from 'sonner';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useDeleteUserMutation, useInvalidateUsersCache, useListUsersQuery } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Code as CodeEl, DefaultSkeleton } from '../../../../utils/tsx-utils';
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
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { filterByName } from '../shared/filter-by-name';
import { SecurityTabsNav } from '../shared/security-tabs-nav';

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
                        await deleteUserMut({ name: record.principalName });
                        toast.success(
                          <span>
                            Deleted user <CodeEl>{record.principalName}</CodeEl>
                          </span>
                        );
                      } catch (err: unknown) {
                        // biome-ignore lint/suspicious/noConsole: error logging
                        console.error('failed to delete user', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
                  };

                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="deleteButton" onClick={() => {}} size="icon-sm" variant="destructive-ghost">
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

const AclsTabLegacy: FC = () => {
  useSecurityBreadcrumbs([]);
  return <AclsTabContent />;
};

const AclsTabNew: FC = () => (
  <>
    <SecurityTabsNav />
    <AclsTabContent />
  </>
);

export const AclsTab: FC = () => (isFeatureFlagEnabled('enableNewSecurityPage') ? <AclsTabNew /> : <AclsTabLegacy />);
