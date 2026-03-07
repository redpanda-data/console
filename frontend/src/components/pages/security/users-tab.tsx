/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useNavigate } from '@tanstack/react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from 'components/redpanda-ui/components/hover-card';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Key, MoreHorizontal, Plus, Search, Trash2, UserCog, Users } from 'lucide-react';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useMemo, useState } from 'react';
import { useListACLsQuery } from 'react-query/api/acl';
import { useDeleteUserMutation, useLegacyListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';
import { Features } from 'state/supported-features';

import { ChangePasswordDialog } from './change-password-dialog';
import { CreateUserDialog } from './create-user-dialog';

const ACL_HOVER_LIMIT = 8;

function getMechanismLabel(mechanism?: SASLMechanism): string | null {
  switch (mechanism) {
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256:
      return 'SCRAM-SHA-256';
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512:
      return 'SCRAM-SHA-512';
    default:
      return null;
  }
}

interface UserAcl {
  resourceType: string;
  resourceName: string;
  operation: string;
  permission: string;
}

interface UsersTabProps {
  onNavigateToTab: (tab: string) => void;
}

export function UsersTab({ onNavigateToTab }: UsersTabProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [passwordDialogUser, setPasswordDialogUser] = useState<{
    name: string;
    mechanism: string | null;
  } | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string | null>(null);
  const { mutateAsync: deleteUserMutation, isPending: isDeletingUser } = useDeleteUserMutation();

  // Fetch data
  const { data: usersData } = useLegacyListUsersQuery();
  const { data: aclsData } = useListACLsQuery();

  const users = useMemo(() => usersData?.users ?? [], [usersData]);

  // Build a map of user -> ACLs from the ACL list
  const userAclsMap = useMemo(() => {
    const map = new Map<string, UserAcl[]>();
    const resources = aclsData?.aclResources ?? [];
    for (const resource of resources) {
      for (const acl of resource.acls) {
        const principal = acl.principal || '';
        // ACL principals are in format "User:name"
        if (principal.startsWith('User:')) {
          const userName = principal.substring(5);
          if (!map.has(userName)) {
            map.set(userName, []);
          }
          map.get(userName)?.push({
            resourceType: getResourceTypeLabel(resource.resourceType),
            resourceName: resource.resourceName,
            operation: getOperationLabel(acl.operation),
            permission: getPermissionLabel(acl.permissionType),
          });
        }
      }
    }
    return map;
  }, [aclsData]);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!searchQuery) {
      return users;
    }
    const q = searchQuery.toLowerCase();
    return users.filter((user) => user.name.toLowerCase().includes(q));
  }, [users, searchQuery]);

  const handleDeleteUser = async () => {
    if (!deleteUserName) {
      return;
    }
    try {
      await deleteUserMutation({ name: deleteUserName });
      toast.success(`User "${deleteUserName}" deleted`);
      setDeleteUserName(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(message);
    }
  };

  const navigateToUser = (userName: string) => {
    navigate({ to: '/security/users/$userName', params: { userName: encodeURIComponent(userName) } });
  };

  return (
    <div aria-labelledby="users-tab" id="users-panel" role="tabpanel">
      <p className="mb-6 max-w-3xl text-muted-foreground text-sm leading-relaxed">
        These users are SASL-SCRAM users managed by your cluster. View the full permissions picture for all identities
        (including OIDC and mTLS) on the Permissions tab.
      </p>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search users"
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            type="text"
            value={searchQuery}
          />
        </div>
        {Boolean(Features.createUser) && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />
            Create user
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-lg border">
        {filteredUsers.length > 0 ? (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-auto">User</TableHead>
                <TableHead className="w-[140px]">Mechanism</TableHead>
                <TableHead className="w-[100px]">ACLs</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const mechanismLabel = getMechanismLabel(user.mechanism);
                const userAcls = userAclsMap.get(user.name) ?? [];

                return (
                  <TableRow className="cursor-pointer" key={user.name} onClick={() => navigateToUser(user.name)}>
                    <TableCell className="max-w-[280px] py-1.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate font-medium">{user.name}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm" side="top">
                            <p className="break-all font-mono text-xs">{user.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {mechanismLabel ? (
                        <Badge className="font-mono font-normal text-xs" variant="outline">
                          {mechanismLabel}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <ACLSummary
                        acls={userAcls}
                        onViewAll={() => onNavigateToTab('permissions')}
                        principal={user.name}
                      />
                    </TableCell>
                    <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button className="size-8" size="icon" variant="ghost">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Actions for {user.name}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => setPasswordDialogUser({ name: user.name, mechanism: mechanismLabel })}
                          >
                            <Key className="size-4" />
                            Change password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigateToUser(user.name)}>
                            <UserCog className="size-4" />
                            View details
                          </DropdownMenuItem>
                          {Boolean(Features.deleteUser) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteUserName(user.name)}
                              >
                                <Trash2 className="size-4" />
                                Delete user
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 font-medium">No users found</h3>
            <p className="mb-4 max-w-sm text-muted-foreground text-sm">
              {searchQuery
                ? `No users matching "${searchQuery}". Try adjusting your search.`
                : 'Get started by creating your first SASL-SCRAM user.'}
            </p>
            {!searchQuery && Boolean(Features.createUser) && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="size-4" />
                Create user
              </Button>
            )}
          </div>
        )}
      </div>

      {filteredUsers.length > 0 && (
        <div className="mt-4 text-muted-foreground text-sm">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
        </div>
      )}

      {/* Create User Dialog */}
      <CreateUserDialog
        onClose={() => setCreateDialogOpen(false)}
        onNavigateToTab={onNavigateToTab}
        open={createDialogOpen}
      />

      {/* Change Password Dialog */}
      {passwordDialogUser !== null && (
        <ChangePasswordDialog
          currentMechanism={passwordDialogUser.mechanism}
          onClose={() => setPasswordDialogUser(null)}
          open
          userName={passwordDialogUser.name}
        />
      )}

      {/* Delete User Confirmation */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteUserName(null);
          }
        }}
        open={Boolean(deleteUserName)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user "{deleteUserName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user and revoke their credentials. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild disabled={isDeletingUser} onClick={handleDeleteUser}>
              <Button variant="destructive">{isDeletingUser ? 'Deleting...' : 'Delete User'}</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function ACLSummary({ acls, principal, onViewAll }: { acls: UserAcl[]; principal: string; onViewAll?: () => void }) {
  if (acls.length === 0) {
    return <span className="text-muted-foreground text-sm">No ACLs</span>;
  }

  const visibleAcls = acls.slice(0, ACL_HOVER_LIMIT);
  const remaining = acls.length - ACL_HOVER_LIMIT;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge className="cursor-pointer font-normal tabular-nums" variant="outline">
          {acls.length} {acls.length === 1 ? 'ACL' : 'ACLs'}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[420px] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-muted-foreground text-xs">Principal</p>
          <p className="truncate font-medium font-mono text-sm" title={`User:${principal}`}>
            User:{principal}
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="w-[200px] px-3 py-1.5 font-medium">Resource</th>
              <th className="w-[80px] px-3 py-1.5 font-medium">Operation</th>
              <th className="w-[70px] px-3 py-1.5 font-medium">Permission</th>
            </tr>
          </thead>
          <tbody>
            {visibleAcls.map((acl, idx) => (
              <tr className="border-b last:border-0" key={`${acl.resourceType}-${acl.resourceName}-${idx}`}>
                <td className="max-w-[200px] px-3 py-1.5">
                  <div className="flex items-center gap-1 overflow-hidden">
                    <span className="shrink-0 text-muted-foreground">{acl.resourceType}:</span>
                    <span className="truncate font-medium" title={acl.resourceName}>
                      {acl.resourceName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5">{acl.operation}</td>
                <td className="px-3 py-1.5">
                  <span className={acl.permission === 'Allow' ? 'text-emerald-600' : 'text-destructive'}>
                    {acl.permission}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {remaining > 0 && (
          <div className="border-t bg-muted/30 px-3 py-2 text-center">
            <button className="text-muted-foreground text-xs hover:text-foreground" onClick={onViewAll} type="button">
              Showing {ACL_HOVER_LIMIT} of {acls.length} ACLs. View all in the Permissions tab.
            </button>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── ACL data helpers ────────────────────────────────────────────────────

function getResourceTypeLabel(resourceType: number): string {
  // These map to ACL_ResourceType enum values
  const labels: Record<number, string> = {
    1: 'Any',
    2: 'Topic',
    3: 'Group',
    4: 'Cluster',
    5: 'TransactionalId',
    6: 'DelegationToken',
    7: 'RedpandaRole',
  };
  return labels[resourceType] ?? 'Unknown';
}

function getOperationLabel(operation: number): string {
  const labels: Record<number, string> = {
    1: 'Any',
    2: 'All',
    3: 'Read',
    4: 'Write',
    5: 'Create',
    6: 'Delete',
    7: 'Alter',
    8: 'Describe',
    9: 'ClusterAction',
    10: 'DescribeConfigs',
    11: 'AlterConfigs',
    12: 'IdempotentWrite',
  };
  return labels[operation] ?? 'Unknown';
}

function getPermissionLabel(permissionType: number): string {
  // ACL_PermissionType: DENY=2, ALLOW=3
  return permissionType === 2 ? 'Deny' : 'Allow';
}
