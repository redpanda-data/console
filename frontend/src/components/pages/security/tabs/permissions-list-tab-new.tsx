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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { ListLayout, ListLayoutContent, ListLayoutFilters } from 'components/redpanda-ui/components/list-layout';
import { ChevronDown, ChevronRight, ExternalLink, KeyRoundIcon, ShieldIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import type { FC } from 'react';
import { useLayoutEffect, useState } from 'react';
import { toast } from 'sonner';
import { pluralizeWithNumber } from 'utils/string';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useDeleteUserMutation, useInvalidateUsersCache } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { setPageHeader } from '../../../../state/ui-state';
import { Code as CodeEl } from '../../../../utils/tsx-utils';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Text } from '../../../redpanda-ui/components/typography';
import { type PrincipalPermissionGroup, usePrincipalPermissions } from '../hooks/use-principal-permissions';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { DescriptionWithHelp } from '../shared/description-with-help';
import { SecurityTabsNav } from '../shared/security-tabs-nav';
import { AddAclDialog } from '../users/add-acl-dialog';

const AclTableRow: FC<{
  resourceType: string;
  resourceName: string;
  operation: string;
  permissionType: 'Allow' | 'Deny';
  host: string;
  editHref?: string;
}> = ({ resourceType, resourceName, operation, permissionType, host, editHref }) => (
  <TableRow>
    <TableCell className="text-muted-foreground">{resourceType}</TableCell>
    <TableCell className="font-mono">{resourceName}</TableCell>
    <TableCell>{operation}</TableCell>
    <TableCell className={permissionType === 'Allow' ? 'text-green-600' : 'text-red-600'}>{permissionType}</TableCell>
    <TableCell className="text-muted-foreground">{host}</TableCell>
    <TableCell align="right">
      {editHref && (
        <a className="text-muted-foreground hover:text-foreground" href={editHref}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </TableCell>
  </TableRow>
);

type PrincipalRowProps = {
  group: PrincipalPermissionGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (deleteUser: boolean, deleteAcls: boolean) => void;
  canDeleteUser: boolean;
};

const PrincipalRow: FC<PrincipalRowProps> = ({ group, isExpanded, onToggle, onDelete, canDeleteUser }) => {
  const [pendingDelete, setPendingDelete] = useState<'user-and-acls' | 'user-only' | null>(null);

  const summaryText = (() => {
    if (group.directAclCount > 0 && group.inheritedAclCount > 0) {
      return `${pluralizeWithNumber(group.directAclCount, 'direct ACL')}, ${pluralizeWithNumber(group.inheritedAclCount, 'ACL')} inherited from roles`;
    }
    if (group.inheritedAclCount > 0) {
      return `${pluralizeWithNumber(group.inheritedAclCount, 'ACL')} inherited from roles`;
    }
    if (group.directAclCount > 0) {
      return pluralizeWithNumber(group.directAclCount, 'direct ACL');
    }
    return 'No ACLs';
  })();

  const hasAcls = group.directAclCount + group.inheritedAclCount > 0;

  return (
    <>
      <DeleteUserConfirmModal
        onConfirm={async () => {
          if (pendingDelete === 'user-and-acls') onDelete(true, true);
          if (pendingDelete === 'user-only') onDelete(true, false);
        }}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
        userName={group.principalName}
      />

      <div className="border-b" data-testid={`row-${group.principalName}`}>
        {/* Principal header row */}
        <div
          className="flex cursor-pointer items-center gap-2 px-3 py-3 hover:bg-muted/20"
          onClick={onToggle}
          onKeyDown={(e) => e.key === 'Enter' && onToggle()}
          role="button"
          tabIndex={0}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <span className="font-medium font-mono text-sm">
              {group.principalType === 'Group' ? 'Group:' : ''}
              {group.principalName}
            </span>
            {group.principalType === 'Group' && <Badge variant="neutral">Group</Badge>}
            <span className="text-muted-foreground text-sm">{summaryText}</span>
            {group.denyCount > 0 && <Badge variant="destructive">{group.denyCount} deny</Badge>}
          </div>

          <div
            className="flex items-center gap-1"
            data-testid={`actions-${group.principalName}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {group.principalType === 'User' && (
              <Link
                className="inline-flex items-center justify-center p-1 text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                params={{ userName: group.principalName }}
                to="/security/users/$userName/details"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button asChild size="icon-sm" variant="ghost">
                  <button type="button">
                    <MoreHorizontalIcon className="h-4 w-4" />
                  </button>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {group.principalType === 'User' && (
                  <>
                    <DropdownMenuItem
                      disabled={!canDeleteUser}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete('user-and-acls');
                      }}
                    >
                      Delete (User and ACLs)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canDeleteUser}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete('user-only');
                      }}
                    >
                      Delete (User only)
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(false, true);
                  }}
                >
                  Delete (ACLs only)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && hasAcls && (
          <div className="border-t bg-background">
            <Table variant="simple">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.directAcls.map((acl, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: no stable key
                  <AclTableRow key={i} {...acl} />
                ))}
              </TableBody>
              {group.roleAclGroups.map((rg) => (
                <TableBody key={rg.roleName}>
                  <TableRow>
                    <TableCell className="bg-muted/40 py-1.5 text-muted-foreground text-xs" colSpan={6}>
                      <div className="flex items-center gap-1.5">
                        <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium uppercase tracking-wide">Via Role: {rg.roleName}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {rg.acls.map((acl, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: no stable key
                    <AclTableRow key={i} {...acl} />
                  ))}
                </TableBody>
              ))}
            </Table>
          </div>
        )}

        {isExpanded && !hasAcls && (
          <Empty className="rounded-none border-x-0 border-b-0 border-dashed py-6">
            <EmptyHeader>
              <EmptyTitle>No ACLs assigned</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </>
  );
};

export const PermissionsListTabNew: FC = () => {
  useLayoutEffect(() => {
    setPageHeader('Security', [
      { title: 'Security', linkTo: '/security/users' },
      { title: 'Permissions', linkTo: '/security/permissions-list' },
    ]);
  }, []);
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useQueryState('search', parseAsString.withDefault(''));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createAclOpen, setCreateAclOpen] = useState(false);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const { principalGroups, isAclsLoading, isAclsError, aclsError, isUsersError, usersError } =
    usePrincipalPermissions();

  const toggleExpanded = (principal: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(principal)) {
        next.delete(principal);
      } else {
        next.add(principal);
      }
      return next;
    });
  };

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

  const onDelete = async (group: PrincipalPermissionGroup, deleteUser: boolean, deleteAcls: boolean) => {
    if (deleteAcls) {
      try {
        await deleteACLsForPrincipal(group.principalName, group.principalType);
      } catch (err: unknown) {
        setAclFailed({ err });
      }
    }
    if (deleteUser) {
      try {
        await deleteUserMutation({ name: group.principalName });
        toast.success(
          <span>
            Deleted user <CodeEl>{group.principalName}</CodeEl>
          </span>
        );
      } catch (err: unknown) {
        setAclFailed({ err });
      }
    }
    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
  };

  const matchesSearch = (group: PrincipalPermissionGroup, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (group.principalName.toLowerCase().includes(q)) return true;
    if (group.principal.toLowerCase().includes(q)) return true;
    if (group.directAcls.some((a) => a.resourceName.toLowerCase().includes(q))) return true;
    if (group.roleAclGroups.some((rg) => rg.roleName.toLowerCase().includes(q))) return true;
    if (group.roleAclGroups.some((rg) => rg.acls.some((a) => a.resourceName.toLowerCase().includes(q)))) return true;
    return false;
  };

  const filteredGroups = principalGroups.filter((g) => matchesSearch(g, searchQuery));

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

  const renderContent = () => {
    if (isAclsLoading) {
      return (
        <div className="rounded-md border">
          {[0, 1, 2].map((i) => (
            <div className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0" key={i}>
              <Skeleton className="h-4 w-4 shrink-0" variant="rounded" />
              <Skeleton variant="text" width="md" />
              <Skeleton variant="text" width="sm" />
            </div>
          ))}
        </div>
      );
    }
    if (filteredGroups.length === 0) {
      if (searchQuery) {
        return <div className="py-8 text-center text-muted-foreground text-sm">No principals match your search.</div>;
      }
      return (
        <div className="rounded-md border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>No permissions yet</EmptyTitle>
              <EmptyDescription>
                A unified view of all principal permissions across your cluster. Create an ACL to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex items-center gap-3">
                <Button onClick={() => setCreateAclOpen(true)}>Create ACL</Button>
                <Button asChild variant="link">
                  <a
                    href="https://docs.redpanda.com/current/manage/security/authorization/acls/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Read the docs →
                  </a>
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        </div>
      );
    }
    return (
      <div className="rounded-md border">
        {filteredGroups.map((group) => (
          <PrincipalRow
            canDeleteUser={Boolean(featureDeleteUser) && group.isScramUser}
            group={group}
            isExpanded={expanded.has(group.principal)}
            key={group.principal}
            onDelete={(deleteUser, deleteAcls) => {
              onDelete(group, deleteUser, deleteAcls).catch(() => {});
            }}
            onToggle={() => toggleExpanded(group.principal)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <SecurityTabsNav />
      <ListLayout>
        <Text className="text-muted-foreground text-sm sm:text-base">
          <DescriptionWithHelp
            short="Unified view of all principal permissions across your cluster."
            title="Permissions"
          >
            <Text>
              A unified view of all principal permissions across your cluster, including direct ACLs and those inherited
              from role bindings. Inherited ACLs are read-only here and must be edited on the respective role page.
            </Text>
          </DescriptionWithHelp>
        </Text>

        <ListLayoutFilters actions={<Button onClick={() => setCreateAclOpen(true)}>Create ACL</Button>}>
          <input
            className="flex h-8 w-full min-w-[140px] max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search principals, resources, roles..."
            value={searchQuery}
          />
        </ListLayoutFilters>

        {aclFailed !== null && <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />}

        <ListLayoutContent>{renderContent()}</ListLayoutContent>
      </ListLayout>

      <AddAclDialog onOpenChange={setCreateAclOpen} open={createAclOpen} />
    </>
  );
};
