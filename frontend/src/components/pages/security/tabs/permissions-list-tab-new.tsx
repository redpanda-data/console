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

import { Link as TanStackLink } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'components/icons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Empty, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import {
  ListLayout,
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { ChevronDown, ChevronRight, ExternalLink, KeyRoundIcon, Trash2Icon, UserIcon, UsersIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useState } from 'react';
import { docsLinks } from 'utils/docs-links';
import { pluralizeWithNumber } from 'utils/string';

import ErrorResult from '../../../../components/misc/error-result';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Badge } from '../../../redpanda-ui/components/badge';
import { Button } from '../../../redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Link } from '../../../redpanda-ui/components/typography';
import { useExpandedRows } from '../hooks/use-expanded-rows';
import { usePendingAction } from '../hooks/use-pending-action';
import { usePrincipalDeletion } from '../hooks/use-principal-deletion';
import {
  type FlatAclEntry,
  type PrincipalPermissionGroup,
  usePrincipalPermissions,
} from '../hooks/use-principal-permissions';
import { useSecurityPageHeader } from '../hooks/use-security-page-header';
import { AclPermissionRow, RoleAclGroupRow } from '../shared/acl-permission-rows';
import { AlertDeleteFailed } from '../shared/alert-delete-failed';
import { DeleteUserConfirmModal } from '../shared/delete-user-confirm-modal';
import { DescriptionWithHelp } from '../shared/description-with-help';
import { SecurityEmptyState } from '../shared/security-empty-state';
import { SecurityTabsNav } from '../shared/security-tabs-nav';
import { AddAclDialog } from '../users/add-acl-dialog';

const AclTableRow = ({ editHref, ...acl }: FlatAclEntry & { editHref?: string }) => (
  <AclPermissionRow {...acl}>
    <TableCell align="right">
      {editHref && (
        <a className="text-muted-foreground hover:text-foreground" href={editHref}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </TableCell>
  </AclPermissionRow>
);

const getAclSummaryText = ({ directAclCount, inheritedAclCount }: PrincipalPermissionGroup) => {
  if (directAclCount > 0 && inheritedAclCount > 0) {
    return `${pluralizeWithNumber(directAclCount, 'direct ACL')}, ${pluralizeWithNumber(inheritedAclCount, 'ACL')} via roles`;
  }
  if (inheritedAclCount > 0) {
    return `${pluralizeWithNumber(inheritedAclCount, 'ACL')} via roles`;
  }
  return directAclCount > 0 ? pluralizeWithNumber(directAclCount, 'direct ACL') : 'No ACLs';
};

type PrincipalRowProps = {
  group: PrincipalPermissionGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (deleteUser: boolean, deleteAcls: boolean) => Promise<void>;
  canDeleteUser: boolean;
};

const PrincipalRow: FC<PrincipalRowProps> = ({ group, isExpanded, onToggle, onDelete, canDeleteUser }) => {
  const [pendingDelete, setPendingDelete] = useState<'user-and-acls' | 'user-only' | 'acls-only' | null>(null);
  const aclsDelete = usePendingAction();
  const closeAclsDialog = () => {
    setPendingDelete(null);
    aclsDelete.clearError();
  };

  const summaryText = getAclSummaryText(group);

  const hasAcls = group.directAclCount + group.inheritedAclCount > 0;
  const PrincipalIcon = group.principalType === 'Group' ? UsersIcon : UserIcon;

  return (
    <>
      <DeleteUserConfirmModal
        onConfirm={async () => {
          if (pendingDelete === 'user-and-acls') {
            await onDelete(true, true);
          }
          if (pendingDelete === 'user-only') {
            await onDelete(true, false);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete === 'user-and-acls' || pendingDelete === 'user-only'}
        userName={group.principalName}
      />
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeAclsDialog();
          }
        }}
        open={pendingDelete === 'acls-only'}
      >
        <DialogContent variant="destructive">
          <DialogHeader>
            <DialogTitle>Delete ACLs for {group.principalName}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            All ACLs assigned directly to <strong>{group.principalName}</strong> will be permanently deleted. This
            action cannot be undone.
            {aclsDelete.errorMessage !== null && (
              <p className="text-body text-destructive" role="alert">
                Could not complete the deletion: {aclsDelete.errorMessage}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={closeAclsDialog} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={aclsDelete.isPending}
              onClick={() => {
                aclsDelete.run(async () => {
                  await onDelete(false, true);
                  setPendingDelete(null);
                });
              }}
              variant="destructive"
            >
              <Trash2Icon />
              Delete ACLs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Collapsible data-testid={`row-${group.principalName}`} onOpenChange={onToggle} open={isExpanded}>
        <div className="overflow-hidden rounded-lg border">
          {/* Card header — distinct background makes each principal easy to scan */}
          <CollapsibleTrigger
            render={
              <div
                className="flex cursor-pointer items-center gap-3 bg-muted/40 px-4 py-3 transition-colors hover:bg-muted/60"
                role="button"
                tabIndex={0}
              >
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <PrincipalIcon className="h-4 w-4" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-body font-semibold">{group.principalName}</span>
                    {group.principalType === 'Group' && (
                      <Badge tone="default" variant="subtle">
                        Group
                      </Badge>
                    )}
                    {group.denyCount > 0 && <Badge tone="destructive">{group.denyCount} deny</Badge>}
                  </div>
                  <span className="text-body-sm text-muted-foreground">{summaryText}</span>
                </div>

                <div
                  className="flex shrink-0 items-center gap-1"
                  data-testid={`actions-${group.principalName}`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  {group.principalType === 'User' && (
                    <Link
                      aria-label={`View user ${group.principalName}`}
                      as={TanStackLink}
                      onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
                      params={{ userName: group.principalName }}
                      to="/security/users/$userName/details"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
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
                      {group.principalType === 'User' && (
                        <>
                          <DropdownMenuItem
                            disabled={!canDeleteUser}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete('user-and-acls');
                            }}
                            variant="destructive"
                          >
                            <Trash2Icon />
                            Delete (User and ACLs)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canDeleteUser}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete('user-only');
                            }}
                            variant="destructive"
                          >
                            <Trash2Icon />
                            Delete (User only)
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete('acls-only');
                        }}
                        variant="destructive"
                      >
                        <Trash2Icon />
                        Delete (ACLs only)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            }
          />

          {/* Expanded ACL table */}
          <CollapsibleContent>
            {hasAcls ? (
              <div className="border-t">
                <Table variant="simple">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource Type</TableHead>
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
                      <RoleAclGroupRow colSpan={6} roleName={rg.roleName} />
                      {rg.acls.map((acl, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: no stable key
                        <AclTableRow key={i} {...acl} />
                      ))}
                    </TableBody>
                  ))}
                </Table>
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No ACLs assigned</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    </>
  );
};

const includesIgnoringCase = (value: string, lowerCaseQuery: string) => value.toLowerCase().includes(lowerCaseQuery);

const principalMatchesSearch = (group: PrincipalPermissionGroup, query: string): boolean => {
  if (!query) {
    return true;
  }
  const q = query.toLowerCase();
  return (
    includesIgnoringCase(group.principalName, q) ||
    includesIgnoringCase(group.principal, q) ||
    group.directAcls.some((a) => includesIgnoringCase(a.resourceName, q)) ||
    group.roleAclGroups.some(
      (rg) => includesIgnoringCase(rg.roleName, q) || rg.acls.some((a) => includesIgnoringCase(a.resourceName, q))
    )
  );
};

const PrincipalRowsSkeleton = () => (
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

const NoPrincipals = ({ searchQuery, onCreateAcl }: { searchQuery: string; onCreateAcl: () => void }) => {
  if (searchQuery) {
    return <div className="py-8 text-center text-body text-muted-foreground">No principals match your search.</div>;
  }
  return (
    <div className="rounded-md border">
      <SecurityEmptyState
        action={<Button onClick={onCreateAcl}>Create ACL</Button>}
        description="A unified view of all principal permissions across your cluster. Create an ACL to get started."
        docsHref={docsLinks.selfManaged.acl}
        icon={<KeyRoundIcon />}
        title="No permissions yet"
      />
    </div>
  );
};

type PrincipalListProps = {
  groups: PrincipalPermissionGroup[];
  isLoading: boolean;
  searchQuery: string;
  onCreateAcl: () => void;
  rows: ReturnType<typeof useExpandedRows>;
};

const PrincipalList = ({ groups, isLoading, searchQuery, onCreateAcl, rows }: PrincipalListProps) => {
  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const deletePrincipal = usePrincipalDeletion((err) => setAclFailed({ err }));

  const renderContent = () => {
    if (isLoading) {
      return <PrincipalRowsSkeleton />;
    }
    if (groups.length === 0) {
      return <NoPrincipals onCreateAcl={onCreateAcl} searchQuery={searchQuery} />;
    }
    return (
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <PrincipalRow
            canDeleteUser={Boolean(featureDeleteUser) && group.isScramUser}
            group={group}
            isExpanded={rows.isExpanded(group.principal)}
            key={group.principal}
            onDelete={(deleteUser, deleteAcls) => deletePrincipal(group, deleteUser, deleteAcls)}
            onToggle={() => rows.toggle(group.principal)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      {aclFailed !== null && <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />}
      <ListLayoutContent>{renderContent()}</ListLayoutContent>
    </>
  );
};

export const PermissionsListTabNew: FC = () => {
  useSecurityPageHeader('permissions');
  const [searchQuery, setSearchQuery] = useQueryState('search', parseAsString.withDefault(''));
  const [createAclOpen, setCreateAclOpen] = useState(false);
  // Held above the error returns so a failed refetch does not collapse expanded principals.
  const rows = useExpandedRows();
  const { principalGroups, isAclsLoading, isAclsError, aclsError, isUsersError, usersError } =
    usePrincipalPermissions();

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
    <>
      <SecurityTabsNav />
      <ListLayout className="my-4 min-h-0">
        <div className="text-body text-muted-foreground sm:text-body-lg">
          <DescriptionWithHelp
            short="Unified view of all principal permissions across your cluster."
            title="Permissions"
          >
            <div className="text-body">
              A unified view of all principal permissions across your cluster, including direct ACLs and those inherited
              from role bindings. Inherited ACLs are read-only here and must be edited on the respective role page.
            </div>
          </DescriptionWithHelp>
        </div>

        <ListLayoutFilters actions={<Button onClick={() => setCreateAclOpen(true)}>Create ACL</Button>}>
          <ListLayoutSearchInput
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search principals, resources, roles..."
            value={searchQuery}
          />
        </ListLayoutFilters>

        <PrincipalList
          groups={principalGroups.filter((g) => principalMatchesSearch(g, searchQuery))}
          isLoading={isAclsLoading}
          onCreateAcl={() => setCreateAclOpen(true)}
          rows={rows}
          searchQuery={searchQuery}
        />
      </ListLayout>

      <AddAclDialog onOpenChange={setCreateAclOpen} open={createAclOpen} />
    </>
  );
};
