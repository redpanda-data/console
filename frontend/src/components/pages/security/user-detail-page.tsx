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

import { create } from '@bufbuild/protobuf';
import { Link, useNavigate } from '@tanstack/react-router';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Check, ChevronRight, Copy, Key, Shield, Trash2 } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import {
  RoleMembershipSchema,
  UpdateRoleMembershipRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect, useMemo, useState } from 'react';
import { useDeleteAclMutation, useGetAclsByPrincipal, useLegacyCreateACLMutation } from 'react-query/api/acl';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from 'react-query/api/security';
import { useDeleteUserMutation, useLegacyListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';

import { ACLDialog, type ACLEntry, ACLRemoveDialog, ACLTableSection } from './acl-editor';
import { ChangePasswordDialog } from './change-password-dialog';

function getMechanismLabel(mechanism?: SASLMechanism): string {
  switch (mechanism) {
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256:
      return 'SCRAM-SHA-256';
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512:
      return 'SCRAM-SHA-512';
    default:
      return 'SCRAM';
  }
}

function PrincipalCopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs transition-colors hover:bg-muted"
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Copy: ${value}`}
      type="button"
    >
      <span className="truncate font-mono text-muted-foreground">{value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}

interface UserDetailPageProps {
  userName: string;
}

export function UserDetailPage({ userName }: UserDetailPageProps) {
  const navigate = useNavigate();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ACL dialog state
  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclRemoveIndex, setAclRemoveIndex] = useState<number | null>(null);

  // Fetch user data
  const { data: usersData } = useLegacyListUsersQuery();
  const user = useMemo(() => usersData?.users?.find((u) => u.name === userName), [usersData, userName]);

  // Fetch roles
  const { data: rolesData } = useListRolesQuery(undefined, { enabled: Boolean(Features.rolesApi) });
  const allRoles = useMemo(() => rolesData?.roles ?? [], [rolesData]);

  // Fetch ACLs for this user
  const { data: aclsData } = useGetAclsByPrincipal(`User:${userName}`);

  // Mutations
  const { mutateAsync: updateMembership } = useUpdateRoleMembershipMutation();
  const { mutateAsync: createACLMutation } = useLegacyCreateACLMutation();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMutation, isPending: isDeletingUser } = useDeleteUserMutation();

  // Transform AclDetail[] (from getAclFromAclListResponse) into flat ACLEntry[]
  const acls: ACLEntry[] = useMemo(() => {
    if (!(aclsData && Array.isArray(aclsData))) {
      return [];
    }
    const resourceTypeLabels: Record<string, string> = {
      topic: 'Topic',
      cluster: 'Cluster',
      consumerGroup: 'Group',
      transactionalId: 'TransactionalId',
      subject: 'Subject',
      schemaRegistry: 'SchemaRegistry',
    };
    const entries: ACLEntry[] = [];
    for (const detail of aclsData) {
      const host = detail.sharedConfig?.host || '*';
      for (const rule of detail.rules ?? []) {
        for (const [op, perm] of Object.entries(rule.operations ?? {})) {
          if (perm === 'not-set') {
            continue;
          }
          entries.push({
            resourceType: resourceTypeLabels[rule.resourceType] ?? rule.resourceType ?? 'Unknown',
            resourceName: rule.selectorValue || '',
            operation: op,
            permission: perm === 'allow' ? 'Allow' : 'Deny',
            host,
          });
        }
      }
    }
    return entries;
  }, [aclsData]);

  // Find which roles this user belongs to
  // We check each role's members list
  const [userRoles, setUserRoles] = useState<string[]>([]);
  // Note: In a real implementation, we'd fetch members for each role
  // For now, roles will be populated from the role members API

  const mechanismLabel = getMechanismLabel(user?.mechanism);

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = userName;
      uiState.pageBreadcrumbs = [
        { title: 'Security', linkTo: '/security' },
        { title: 'Users', linkTo: '/security/users' },
        {
          title: userName,
          linkTo: `/security/users/${encodeURIComponent(userName)}`,
          options: { canBeTruncated: true, canBeCopied: true },
        },
      ];
    });
  }, [userName]);

  const availableToAssign = useMemo(() => allRoles.filter((r) => !userRoles.includes(r.name)), [allRoles, userRoles]);

  const handleAssignRole = async (roleName: string) => {
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          create: false,
          add: [create(RoleMembershipSchema, { principal: `User:${userName}` })],
          remove: [],
        })
      );
      setUserRoles((prev) => [...prev, roleName]);
      toast.success(`Assigned role "${roleName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign role';
      toast.error(message);
    }
  };

  const handleRemoveRole = async (roleName: string) => {
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          create: false,
          add: [],
          remove: [create(RoleMembershipSchema, { principal: `User:${userName}` })],
        })
      );
      setUserRoles((prev) => prev.filter((r) => r !== roleName));
      toast.success(`Removed role "${roleName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove role';
      toast.error(message);
    }
  };

  const handleSaveAcl = async (entry: ACLEntry) => {
    const resourceTypeMap: Record<string, ACL_ResourceType> = {
      Topic: ACL_ResourceType.TOPIC,
      Group: ACL_ResourceType.GROUP,
      Cluster: ACL_ResourceType.CLUSTER,
      TransactionalId: ACL_ResourceType.TRANSACTIONAL_ID,
    };
    const operationMap: Record<string, ACL_Operation> = {
      All: ACL_Operation.ALL,
      Read: ACL_Operation.READ,
      Write: ACL_Operation.WRITE,
      Create: ACL_Operation.CREATE,
      Delete: ACL_Operation.DELETE,
      Alter: ACL_Operation.ALTER,
      Describe: ACL_Operation.DESCRIBE,
      ClusterAction: ACL_Operation.CLUSTER_ACTION,
      DescribeConfigs: ACL_Operation.DESCRIBE_CONFIGS,
      AlterConfigs: ACL_Operation.ALTER_CONFIGS,
      IdempotentWrite: ACL_Operation.IDEMPOTENT_WRITE,
    };
    const permissionMap: Record<string, ACL_PermissionType> = {
      Allow: ACL_PermissionType.ALLOW,
      Deny: ACL_PermissionType.DENY,
    };

    try {
      await createACLMutation(
        create(CreateACLRequestSchema, {
          resourceType: resourceTypeMap[entry.resourceType] ?? ACL_ResourceType.TOPIC,
          resourceName: entry.resourceName,
          resourcePatternType: ACL_ResourcePatternType.LITERAL,
          principal: `User:${userName}`,
          host: entry.host,
          operation: operationMap[entry.operation] ?? ACL_Operation.ALL,
          permissionType: permissionMap[entry.permission] ?? ACL_PermissionType.ALLOW,
        })
      );
      toast.success('ACL created');
      setAclDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create ACL';
      toast.error(message);
    }
  };

  const handleRemoveAcl = async (idx: number) => {
    const acl = acls[idx];
    if (!acl) {
      return;
    }
    // The actual deletion would use deleteACL mutation
    // For now, trigger the confirm dialog
    setAclRemoveIndex(idx);
  };

  const confirmRemoveAcl = async () => {
    if (aclRemoveIndex === null) {
      return;
    }
    const acl = acls[aclRemoveIndex];
    if (!acl) {
      return;
    }

    const resourceTypeMap: Record<string, ACL_ResourceType> = {
      Topic: ACL_ResourceType.TOPIC,
      Group: ACL_ResourceType.GROUP,
      Cluster: ACL_ResourceType.CLUSTER,
      TransactionalId: ACL_ResourceType.TRANSACTIONAL_ID,
    };
    const operationMap: Record<string, ACL_Operation> = {
      All: ACL_Operation.ALL,
      Read: ACL_Operation.READ,
      Write: ACL_Operation.WRITE,
      Create: ACL_Operation.CREATE,
      Delete: ACL_Operation.DELETE,
      Alter: ACL_Operation.ALTER,
      Describe: ACL_Operation.DESCRIBE,
      ClusterAction: ACL_Operation.CLUSTER_ACTION,
      DescribeConfigs: ACL_Operation.DESCRIBE_CONFIGS,
      AlterConfigs: ACL_Operation.ALTER_CONFIGS,
      IdempotentWrite: ACL_Operation.IDEMPOTENT_WRITE,
    };
    const permissionMap: Record<string, ACL_PermissionType> = {
      Allow: ACL_PermissionType.ALLOW,
      Deny: ACL_PermissionType.DENY,
    };

    try {
      await deleteACLMutation(
        create(DeleteACLsRequestSchema, {
          filter: {
            principal: `User:${userName}`,
            resourceType: resourceTypeMap[acl.resourceType] ?? ACL_ResourceType.TOPIC,
            resourceName: acl.resourceName,
            host: acl.host,
            operation: operationMap[acl.operation] ?? ACL_Operation.ALL,
            permissionType: permissionMap[acl.permission] ?? ACL_PermissionType.ALLOW,
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
          },
        })
      );
      toast.success('ACL removed');
      setAclRemoveIndex(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove ACL';
      toast.error(message);
    }
  };

  const handleDeleteUser = async () => {
    try {
      await deleteUserMutation({ name: userName });
      toast.success(`User "${userName}" deleted`);
      navigate({ to: '/security/$tab', params: { tab: 'users' } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(message);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground text-sm">User not found.</p>
        <Button asChild variant="outline">
          <Link params={{ tab: 'users' }} to="/security/$tab">
            Back to Security
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-8 pt-2">
        {/* Description */}
        <p className="text-muted-foreground text-sm">Manage roles, ACLs, and credentials for this user.</p>

        {/* Properties */}
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Principal</span>
            <PrincipalCopyField value={`User:${userName}`} />
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mechanism</span>
            <Badge className="font-mono font-normal text-xs" variant="outline">
              {mechanismLabel}
            </Badge>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => setPasswordDialogOpen(true)} size="sm" variant="outline">
              <Key className="size-4" />
              Change Password
            </Button>
            {Boolean(Features.deleteUser) && (
              <Button onClick={() => setDeleteDialogOpen(true)} size="sm" variant="destructive">
                <Trash2 className="size-4" />
                Delete User
              </Button>
            )}
          </div>
        </div>

        {/* Roles Section */}
        {Boolean(Features.rolesApi) && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-muted-foreground" />
                <h2 className="font-medium text-sm">Roles</h2>
                <span className="text-muted-foreground text-xs">{userRoles.length} assigned</span>
              </div>
              {availableToAssign.length > 0 ? (
                <Select onValueChange={handleAssignRole} value="">
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Assign a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAssign.map((role) => (
                      <SelectItem key={role.name} value={role.name}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select disabled value="">
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Assign a role..." />
                          </SelectTrigger>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>No roles available. Create a role first.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {userRoles.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <Shield className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="font-medium text-sm">No roles assigned</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Assign roles to grant this user predefined sets of permissions.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border">
                {userRoles.map((role, idx) => (
                  <div
                    className={`flex items-center justify-between px-4 py-3 ${idx < userRoles.length - 1 ? 'border-b' : ''}`}
                    key={role}
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="size-4 text-muted-foreground" />
                      <Link
                        className="font-medium text-sm hover:underline"
                        params={{ roleName: encodeURIComponent(role) }}
                        to="/security/roles/$roleName"
                      >
                        {role}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveRole(role)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Remove {role}</span>
                      </Button>
                      <Link params={{ roleName: encodeURIComponent(role) }} to="/security/roles/$roleName">
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACLs Section */}
        <ACLTableSection acls={acls} context="user" onAdd={() => setAclDialogOpen(true)} onRemove={handleRemoveAcl} />
      </div>

      {/* ACL Create Dialog */}
      <ACLDialog context="user" onClose={() => setAclDialogOpen(false)} onSave={handleSaveAcl} open={aclDialogOpen} />

      {/* ACL Remove Confirmation */}
      <ACLRemoveDialog
        acl={aclRemoveIndex !== null ? (acls[aclRemoveIndex] ?? null) : null}
        context="user"
        onClose={() => setAclRemoveIndex(null)}
        onConfirm={confirmRemoveAcl}
        open={aclRemoveIndex !== null}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        currentMechanism={mechanismLabel}
        onClose={() => setPasswordDialogOpen(false)}
        open={passwordDialogOpen}
        userName={userName}
      />

      {/* Delete User Confirmation */}
      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user "{userName}"?</AlertDialogTitle>
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
    </>
  );
}
