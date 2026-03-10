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
import { Link } from '@tanstack/react-router';
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
import { Combobox } from 'components/redpanda-ui/components/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { Plus, Search, Trash2, Users } from 'lucide-react';
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
import { useEffect, useMemo, useState } from 'react';
import {
  useDeleteAclMutation,
  useGetAclsByPrincipal,
  useLegacyCreateACLMutation,
  useListACLsQuery,
} from 'react-query/api/acl';
import { useGetRoleQuery, useListRolesQuery, useUpdateRoleMembershipMutation } from 'react-query/api/security';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ACLDialog, type ACLEntry, ACLRemoveDialog, ACLTableSection } from './acl-editor';
import {
  buildPrincipalAutocompleteOptions,
  buildResourceOptionsByType,
  flattenAclDetails,
  sortByPrincipal,
} from './security-acl-utils';

const PRINCIPAL_SEARCH_THRESHOLD = 5;

interface RoleDetailPageProps {
  roleName: string;
}

export function RoleDetailPage({ roleName }: RoleDetailPageProps) {
  // ACL dialog state
  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclRemoveIndex, setAclRemoveIndex] = useState<number | null>(null);

  // Principal management state
  const [addPrincipalDialogOpen, setAddPrincipalDialogOpen] = useState(false);
  const [newPrincipal, setNewPrincipal] = useState('');
  const [principalError, setPrincipalError] = useState<string | null>(null);
  const [isAddingPrincipal, setIsAddingPrincipal] = useState(false);
  const [removePrincipal, setRemovePrincipal] = useState<string | null>(null);
  const [isRemovingPrincipal, setIsRemovingPrincipal] = useState(false);
  const [principalSearch, setPrincipalSearch] = useState('');

  // Fetch role data
  const { data: roleData } = useGetRoleQuery({ roleName });
  const members = useMemo(() => sortByPrincipal(roleData?.members ?? []), [roleData]);
  const { data: usersData } = useLegacyListUsersQuery();
  const { data: rolesData } = useListRolesQuery();
  const { data: allAclsData } = useListACLsQuery();

  // Fetch ACLs for this role
  const { data: aclsData } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`);

  // Mutations
  const { mutateAsync: updateMembership } = useUpdateRoleMembershipMutation();
  const { mutateAsync: createACLMutation } = useLegacyCreateACLMutation();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();

  // Transform ACLs to display format
  const acls: ACLEntry[] = useMemo(() => flattenAclDetails(aclsData), [aclsData]);
  const principalOptions = useMemo(
    () =>
      buildPrincipalAutocompleteOptions({
        excludePrincipals: members.map((member) => member.principal),
        principals: [
          ...members.map((member) => member.principal),
          ...((allAclsData?.aclResources ?? []).flatMap((resource) =>
            resource.acls.map((acl) => acl.principal || '').filter(Boolean)
          ) ?? []),
        ],
        roles: rolesData?.roles?.map((role) => role.name) ?? [],
        users: usersData?.users?.map((user) => user.name) ?? [],
      }),
    [allAclsData, members, rolesData, usersData]
  );
  const resourceOptionsByType = useMemo(
    () => buildResourceOptionsByType(allAclsData?.aclResources ?? []),
    [allAclsData]
  );

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!principalSearch) {
      return members;
    }
    const q = principalSearch.toLowerCase();
    return members.filter((m) => m.principal.toLowerCase().includes(q));
  }, [members, principalSearch]);

  useEffect(() => {
    uiState.pageTitle = roleName;
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      {
        title: roleName,
        linkTo: `/security/roles/${encodeURIComponent(roleName)}`,
        options: { canBeTruncated: true, canBeCopied: true },
      },
    ];
  }, [roleName]);

  // ─── Principal handlers ───────────────────────────────────────────────

  const handleAddPrincipal = async () => {
    const trimmed = newPrincipal.trim();
    if (!trimmed) {
      setPrincipalError('Principal is required');
      return;
    }
    if (!trimmed.includes(':')) {
      setPrincipalError('Principal must include a type prefix (e.g. User:name)');
      return;
    }
    if (members.some((m) => m.principal === trimmed)) {
      setPrincipalError('This principal is already assigned to this role');
      return;
    }

    setIsAddingPrincipal(true);
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          create: false,
          add: [create(RoleMembershipSchema, { principal: trimmed })],
          remove: [],
        })
      );
      toast.success(`Added "${trimmed}" to role`);
      setAddPrincipalDialogOpen(false);
      setNewPrincipal('');
      setPrincipalError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add principal';
      toast.error(message);
    } finally {
      setIsAddingPrincipal(false);
    }
  };

  const handleRemovePrincipal = async () => {
    if (!removePrincipal) {
      return;
    }
    setIsRemovingPrincipal(true);
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          create: false,
          add: [],
          remove: [create(RoleMembershipSchema, { principal: removePrincipal })],
        })
      );
      toast.success(`Removed "${removePrincipal}" from role`);
      setRemovePrincipal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove principal';
      toast.error(message);
    } finally {
      setIsRemovingPrincipal(false);
    }
  };

  // ─── ACL handlers ─────────────────────────────────────────────────────

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

  const handleSaveAcl = async (entry: ACLEntry) => {
    try {
      await createACLMutation(
        create(CreateACLRequestSchema, {
          resourceType: resourceTypeMap[entry.resourceType] ?? ACL_ResourceType.TOPIC,
          resourceName: entry.resourceName,
          resourcePatternType: entry.resourcePatternType ?? ACL_ResourcePatternType.LITERAL,
          principal: `RedpandaRole:${roleName}`,
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

  const handleRemoveAcl = (idx: number) => {
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

    try {
      await deleteACLMutation(
        create(DeleteACLsRequestSchema, {
          filter: {
            principal: `RedpandaRole:${roleName}`,
            resourceType: resourceTypeMap[acl.resourceType] ?? ACL_ResourceType.TOPIC,
            resourceName: acl.resourceName,
            host: acl.host,
            operation: operationMap[acl.operation] ?? ACL_Operation.ALL,
            permissionType: permissionMap[acl.permission] ?? ACL_PermissionType.ALLOW,
            resourcePatternType: acl.resourcePatternType ?? ACL_ResourcePatternType.LITERAL,
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

  if (!roleData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Text variant="muted">Role not found.</Text>
        <Button asChild variant="outline">
          <Link params={{ tab: 'roles' }} to="/security/$tab">
            Back to Security
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <Text className="max-w-3xl text-base leading-6" variant="muted">
          Manage the ACLs and principals assigned to this role.
        </Text>

        {/* ACLs Section */}
        <ACLTableSection acls={acls} context="role" onAdd={() => setAclDialogOpen(true)} onRemove={handleRemoveAcl} />

        {/* Principals Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <Text as="span" className="font-semibold text-base">
                Principals
              </Text>
              <Text as="span" variant="muted">
                {members.length} {members.length === 1 ? 'principal' : 'principals'}
              </Text>
            </div>
            <Button
              onClick={() => {
                setAddPrincipalDialogOpen(true);
                setNewPrincipal('');
                setPrincipalError(null);
              }}
            >
              <Plus className="size-4" />
              Add Principal
            </Button>
          </div>

          {/* Principal search (shown when > threshold) */}
          {members.length > PRINCIPAL_SEARCH_THRESHOLD && (
            <div className="relative mb-3 w-full max-w-sm">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search principals"
                className="pl-9"
                onChange={(e) => setPrincipalSearch(e.target.value)}
                placeholder="Search principals..."
                type="text"
                value={principalSearch}
              />
            </div>
          )}

          <div className="overflow-hidden rounded-lg border">
            {filteredMembers.length > 0 ? (
              <div>
                {filteredMembers.map((member, idx) => (
                  <div
                    className={`flex items-center justify-between px-4 py-3 ${idx < filteredMembers.length - 1 ? 'border-b' : ''}`}
                    key={member.principal}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge className="shrink-0 font-normal text-sm" variant="outline">
                        {member.principal.split(':')[0] || 'User'}
                      </Badge>
                      <span className="truncate font-mono text-base" title={member.principal}>
                        {member.principal.includes(':')
                          ? member.principal.split(':').slice(1).join(':')
                          : member.principal}
                      </span>
                    </div>
                    <Button
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemovePrincipal(member.principal)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remove {member.principal}</span>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty className="py-12">
                <EmptyMedia variant="icon">
                  <Users className="size-6" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{principalSearch ? 'No principals found' : 'No principals assigned'}</EmptyTitle>
                  <EmptyDescription>
                    {principalSearch
                      ? 'Try adjusting your search query.'
                      : 'Add principals to grant them the permissions defined by this role.'}
                  </EmptyDescription>
                </EmptyHeader>
                {!principalSearch && (
                  <Button
                    onClick={() => {
                      setAddPrincipalDialogOpen(true);
                      setNewPrincipal('');
                      setPrincipalError(null);
                    }}
                  >
                    <Plus className="size-4" />
                    Add Principal
                  </Button>
                )}
              </Empty>
            )}
          </div>
        </div>
      </div>

      {/* ACL Create Dialog */}
      <ACLDialog
        context="role"
        onClose={() => setAclDialogOpen(false)}
        onSave={handleSaveAcl}
        open={aclDialogOpen}
        resourceOptionsByType={resourceOptionsByType}
      />

      {/* ACL Remove Confirmation */}
      <ACLRemoveDialog
        acl={aclRemoveIndex !== null ? (acls[aclRemoveIndex] ?? null) : null}
        context="role"
        onClose={() => setAclRemoveIndex(null)}
        onConfirm={confirmRemoveAcl}
        open={aclRemoveIndex !== null}
      />

      {/* Add Principal Dialog */}
      <Dialog onOpenChange={(open) => !open && setAddPrincipalDialogOpen(false)} open={addPrincipalDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader spacing="loose">
            <DialogTitle>Add Principal</DialogTitle>
            <DialogDescription>Add a principal to this role to grant them its permissions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Combobox
                autocomplete
                className="font-mono"
                creatable
                onChange={(value) => {
                  setNewPrincipal(value);
                  setPrincipalError(null);
                }}
                options={principalOptions}
                placeholder="e.g. User:alice"
                value={newPrincipal}
              />
              <p className="text-base text-muted-foreground leading-6">
                Enter a principal in the format <code className="rounded bg-muted px-1 font-mono">Type:name</code> (e.g.
                User:alice, Group:my-team).
              </p>
              {Boolean(principalError) && <p className="text-base text-destructive leading-6">{principalError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setAddPrincipalDialogOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={isAddingPrincipal} onClick={handleAddPrincipal}>
              {isAddingPrincipal ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Principal Confirmation Dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemovePrincipal(null);
          }
        }}
        open={Boolean(removePrincipal)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove principal "{removePrincipal}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This principal will lose all permissions granted by this role. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild disabled={isRemovingPrincipal} onClick={handleRemovePrincipal}>
              <Button variant="destructive">{isRemovingPrincipal ? 'Removing...' : 'Remove'}</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
