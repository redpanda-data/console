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
import { createQueryOptions, useTransport } from '@connectrpc/connect-query';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { getAclFromAclListResponse } from 'components/pages/acls/new-acl/acl.model';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { ChevronDown, ChevronRight, ExternalLink, Lock, Plus, Search, Shield, Trash2, X } from 'lucide-react';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
  DeleteACLsRequestSchema,
  type ListACLsResponse,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { getRole } from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { useMemo, useState } from 'react';
import {
  getACLOperation,
  useDeleteAclMutation,
  useLegacyCreateACLMutation,
  useListACLsQuery,
} from 'react-query/api/acl';
import { useListRolesQuery } from 'react-query/api/security';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';

import {
  ACLDialog,
  type ACLEntry,
  ACLRemoveDialog,
  getPatternTypeLabel,
  PRINCIPAL_MAX,
  PrincipalStepDialog,
  RESOURCE_NAME_MAX,
  truncateText,
} from './acl-editor';
import {
  buildPrincipalAutocompleteOptions,
  buildResourceOptionsByType,
  flattenAclDetails,
  getAclResourceTypeLabel,
  sortAclEntries,
  sortByName,
  sortByPrincipal,
} from './security-acl-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type DirectACL = ACLEntry & {
  principal: string;
  resourcePatternType: number;
};

type InheritedACL = ACLEntry & {
  roleName: string;
};

type PrincipalGroup = {
  principal: string;
  isBrokerManaged: boolean;
  assignedRoles: { name: string }[];
  directAcls: DirectACL[];
  inheritedAcls: InheritedACL[];
  denyCount: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parsePrincipal(principal: string): { type: string; name: string } {
  const colonIndex = principal.indexOf(':');
  if (colonIndex === -1) {
    return { type: 'User', name: principal };
  }
  return {
    type: principal.substring(0, colonIndex),
    name: principal.substring(colonIndex + 1),
  };
}

function getOperationStr(op: ACL_Operation): string {
  return getACLOperation(op);
}

function getPermissionStr(pt: ACL_PermissionType): string {
  switch (pt) {
    case ACL_PermissionType.ALLOW:
      return 'Allow';
    case ACL_PermissionType.DENY:
      return 'Deny';
    default:
      return 'Allow';
  }
}

function getAclSummaryText(directCount: number, inheritedCount: number): string {
  const directLabel = `${directCount} direct ${directCount === 1 ? 'ACL' : 'ACLs'}`;
  const inheritedLabel = `${inheritedCount} ${inheritedCount === 1 ? 'ACL' : 'ACLs'} inherited from roles`;

  if (directCount > 0 && inheritedCount > 0) {
    return `${directLabel}, ${inheritedLabel}`;
  }
  if (inheritedCount > 0) {
    return inheritedLabel;
  }
  return directLabel;
}

function getPermissionColorClass(permission: string, inherited: boolean): string {
  if (inherited) {
    return permission === 'Allow' ? 'text-emerald-600/50' : 'text-destructive/50';
  }
  return permission === 'Allow' ? 'text-emerald-600' : 'text-destructive';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PermissionsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DirectACL | null>(null);
  const [createPrincipal, setCreatePrincipal] = useState('');
  const [createStep, setCreateStep] = useState<'principal' | 'acl'>('principal');

  // Fetch data
  const { data: usersData } = useLegacyListUsersQuery();
  const { data: aclsData } = useListACLsQuery();
  const { data: rolesData } = useListRolesQuery();

  const users = useMemo(() => sortByName(usersData?.users ?? []), [usersData]);
  const aclResources = useMemo(() => aclsData?.aclResources ?? [], [aclsData]);
  const roles = useMemo(() => sortByName(rolesData?.roles ?? []), [rolesData]);
  const resourceOptionsByType = useMemo(() => buildResourceOptionsByType(aclResources), [aclResources]);
  const { mutateAsync: createACL } = useLegacyCreateACLMutation();
  const { mutateAsync: deleteACL } = useDeleteAclMutation();
  const transport = useTransport();

  const roleDetailQueries = useQueries({
    queries: roles.map((role) =>
      createQueryOptions(
        getRole,
        {
          roleName: role.name,
        },
        { transport }
      )
    ),
  });

  const roleAclQueries = useQueries({
    queries: roles.map((role) => ({
      ...createQueryOptions(
        listACLs,
        {
          filter: {
            principal: `RedpandaRole:${role.name}`,
          },
        },
        { transport }
      ),
      select: (aclList: ListACLsResponse) => flattenAclDetails(getAclFromAclListResponse(aclList)),
    })),
  });

  const principalOptions = useMemo(() => {
    const aclPrincipals = aclResources
      .flatMap((resource) => resource.acls.map((acl) => acl.principal || ''))
      .filter(Boolean);
    const roleMembershipPrincipals = roleDetailQueries.flatMap((query) =>
      (query.data?.members ?? []).map((member) => member.principal || '').filter(Boolean)
    );

    return buildPrincipalAutocompleteOptions({
      principals: [...aclPrincipals, ...roleMembershipPrincipals],
      roles: roles.map((role) => role.name),
      users: users.map((user) => user.name),
    });
  }, [aclResources, roleDetailQueries, roles, users]);

  // Build principal groups from ACL data
  const allGroups = useMemo(() => {
    const map = new Map<string, PrincipalGroup>();
    const userNames = new Set(users.map((u) => u.name));

    const getOrCreate = (principal: string): PrincipalGroup => {
      let group = map.get(principal);
      if (!group) {
        const parsed = parsePrincipal(principal);
        const isBrokerManaged = parsed.type === 'User' && userNames.has(parsed.name);
        group = {
          principal,
          isBrokerManaged,
          assignedRoles: [],
          directAcls: [],
          inheritedAcls: [],
          denyCount: 0,
        };
        map.set(principal, group);
      }
      return group;
    };

    // Add direct ACLs from the ACL list response
    for (const resource of aclResources) {
      for (const acl of resource.acls) {
        const principal = acl.principal || '';
        if (!principal) {
          continue;
        }
        const group = getOrCreate(principal);
        group.directAcls.push({
          principal,
          resourceType: getAclResourceTypeLabel(resource.resourceType) ?? 'Unknown',
          resourceName: resource.resourceName,
          operation: getOperationStr(acl.operation),
          permission: getPermissionStr(acl.permissionType),
          host: acl.host || '*',
          resourcePatternType: resource.resourcePatternType,
        });
      }
    }

    for (const [index, role] of roles.entries()) {
      const members = roleDetailQueries[index]?.data?.members ?? [];
      const inheritedAcls = roleAclQueries[index]?.data ?? [];

      for (const member of members) {
        const principal = member.principal;
        if (!principal) {
          continue;
        }

        const group = getOrCreate(principal);
        if (!group.assignedRoles.some((assignedRole) => assignedRole.name === role.name)) {
          group.assignedRoles.push({ name: role.name });
        }

        for (const acl of inheritedAcls) {
          group.inheritedAcls.push({
            ...acl,
            roleName: role.name,
          });
        }
      }
    }

    // Compute deny counts
    for (const group of map.values()) {
      group.assignedRoles = sortByName(group.assignedRoles);
      group.directAcls = sortAclEntries(group.directAcls);
      group.inheritedAcls = sortAclEntries(group.inheritedAcls);
      group.denyCount =
        group.directAcls.filter((a) => a.permission === 'Deny').length +
        group.inheritedAcls.filter((a) => a.permission === 'Deny').length;
    }

    return sortByPrincipal(Array.from(map.values()));
  }, [aclResources, roleAclQueries, roleDetailQueries, roles, users]);

  // Filter groups
  const groups = useMemo(() => {
    if (!searchQuery) {
      return allGroups;
    }
    const q = searchQuery.toLowerCase();
    return allGroups
      .map((group) => {
        const principalMatch = group.principal.toLowerCase().includes(q);
        const roleMatch = group.assignedRoles.some((r) => r.name.toLowerCase().includes(q));
        const matchingDirect = group.directAcls.filter(
          (a) =>
            a.resourceName.toLowerCase().includes(q) ||
            a.operation.toLowerCase().includes(q) ||
            a.resourceType.toLowerCase().includes(q) ||
            a.host.toLowerCase().includes(q)
        );
        const matchingInherited = group.inheritedAcls.filter(
          (a) =>
            a.resourceName.toLowerCase().includes(q) ||
            a.operation.toLowerCase().includes(q) ||
            a.resourceType.toLowerCase().includes(q) ||
            a.host.toLowerCase().includes(q) ||
            a.roleName.toLowerCase().includes(q)
        );

        if (principalMatch || roleMatch) {
          return group;
        }
        if (matchingDirect.length > 0 || matchingInherited.length > 0) {
          return { ...group, directAcls: matchingDirect, inheritedAcls: matchingInherited };
        }
        return null;
      })
      .filter(Boolean) as PrincipalGroup[];
  }, [allGroups, searchQuery]);

  const toggleGroup = (principal: string) => {
    setCollapsed((prev) => ({ ...prev, [principal]: !(prev[principal] ?? false) }));
  };

  // ─── CRUD handlers ──────────────────────────────────────────────────────

  const handleCreate = (preselectedPrincipal?: string) => {
    if (preselectedPrincipal) {
      setCreatePrincipal(preselectedPrincipal);
      setCreateStep('acl');
    } else {
      setCreatePrincipal('');
      setCreateStep('principal');
    }
    setDialogOpen(true);
  };

  const handleSave = async (entry: ACLEntry) => {
    const principal = createPrincipal;

    try {
      // Map string values back to proto enums for the API call
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

      await createACL(
        create(CreateACLRequestSchema, {
          resourceType: resourceTypeMap[entry.resourceType] ?? ACL_ResourceType.TOPIC,
          resourceName: entry.resourceName,
          resourcePatternType: entry.resourcePatternType ?? ACL_ResourcePatternType.LITERAL,
          principal,
          host: entry.host,
          operation: operationMap[entry.operation] ?? ACL_Operation.ALL,
          permissionType: permissionMap[entry.permission] ?? ACL_PermissionType.ALLOW,
        })
      );
      toast.success('ACL created');
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create ACL';
      toast.error(message);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) {
      return;
    }

    try {
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

      await deleteACL(
        create(DeleteACLsRequestSchema, {
          filter: {
            principal: removeTarget.principal,
            resourceType: resourceTypeMap[removeTarget.resourceType] ?? ACL_ResourceType.TOPIC,
            resourceName: removeTarget.resourceName,
            host: removeTarget.host,
            operation: operationMap[removeTarget.operation] ?? ACL_Operation.ALL,
            permissionType: permissionMap[removeTarget.permission] ?? ACL_PermissionType.ALLOW,
            resourcePatternType: removeTarget.resourcePatternType || ACL_ResourcePatternType.LITERAL,
          },
        })
      );
      toast.success('ACL removed');
      setRemoveTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove ACL';
      toast.error(message);
    }
  };

  return (
    <div aria-labelledby="permissions-tab" id="permissions-panel" role="tabpanel">
      <Text className="max-w-3xl pb-2 text-base leading-6" variant="muted">
        A unified view of all principal permissions across your cluster, including direct ACLs and those inherited from
        role bindings. Inherited ACLs are read-only here and must be edited on the respective role page.
      </Text>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search principals"
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search principals, resources, roles..."
            type="text"
            value={searchQuery}
          />
        </div>
        {Boolean(searchQuery) && (
          <Button
            className="h-9 gap-1 text-muted-foreground"
            onClick={() => setSearchQuery('')}
            size="sm"
            variant="ghost"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
        <Button className="ml-auto" onClick={() => handleCreate()}>
          <Plus className="size-4" />
          Create ACL
        </Button>
      </div>

      {/* Grouped list */}
      {groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <PrincipalGroupCard
              collapsed={collapsed[group.principal] ?? false}
              group={group}
              key={group.principal}
              onCreate={handleCreate}
              onRemove={setRemoveTarget}
              onToggle={() => toggleGroup(group.principal)}
            />
          ))}
        </div>
      ) : (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <Shield className="size-6" />
          </EmptyMedia>
          {allGroups.length === 0 ? (
            <>
              <EmptyHeader>
                <EmptyTitle>No principals found</EmptyTitle>
                <EmptyDescription>Create ACLs or assign roles to principals to see them here.</EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => handleCreate()}>
                <Plus className="size-4" />
                Create ACL
              </Button>
            </>
          ) : (
            <>
              <EmptyHeader>
                <EmptyTitle>No matching principals</EmptyTitle>
                <EmptyDescription>Try a different search query.</EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => setSearchQuery('')} variant="outline">
                Clear search
              </Button>
            </>
          )}
        </Empty>
      )}

      {/* Table Footer */}
      {groups.length > 0 && (
        <div className="mt-4 text-muted-foreground text-sm">
          {searchQuery
            ? `${groups.length} of ${allGroups.length} ${allGroups.length === 1 ? 'principal' : 'principals'}`
            : `${allGroups.length} ${allGroups.length === 1 ? 'principal' : 'principals'}`}
        </div>
      )}

      {/* Create ACL — principal step */}
      {dialogOpen && createStep === 'principal' && (
        <PrincipalStepDialog
          onChange={setCreatePrincipal}
          onClose={() => setDialogOpen(false)}
          onContinue={() => setCreateStep('acl')}
          options={principalOptions}
          value={createPrincipal}
        />
      )}

      {/* Create ACL — ACL fields step */}
      {dialogOpen && createStep === 'acl' && (
        <ACLDialog
          context="user"
          onClose={() => setDialogOpen(false)}
          onSave={handleSave}
          open
          resourceOptionsByType={resourceOptionsByType}
        />
      )}

      {/* Remove confirmation */}
      <ACLRemoveDialog
        acl={removeTarget}
        context="user"
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        open={removeTarget !== null}
      />
    </div>
  );
}

// ─── Principal Group Card ─────────────────────────────────────────────────────

function PrincipalGroupCard({
  group,
  collapsed,
  onToggle,
  onCreate,
  onRemove,
}: {
  group: PrincipalGroup;
  collapsed: boolean;
  onToggle: () => void;
  onCreate: (principal: string) => void;
  onRemove: (acl: DirectACL) => void;
}) {
  const parsed = parsePrincipal(group.principal);
  const hasAcls = group.directAcls.length > 0 || group.inheritedAcls.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Group header */}
      <button
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        onClick={onToggle}
        style={{ minWidth: 0 }}
        type="button"
      >
        {collapsed ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <span className="block font-mono font-semibold text-base" title={group.principal}>
            {truncateText(group.principal, PRINCIPAL_MAX)}
          </span>
          <span className="block text-muted-foreground text-sm">
            {getAclSummaryText(group.directAcls.length, group.inheritedAcls.length)}
          </span>
        </div>
        {group.denyCount > 0 && (
          <Badge className="shrink-0 font-normal text-sm tabular-nums" variant="destructive">
            {group.denyCount} deny
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onCreate(group.principal);
            }}
            variant="ghost"
          >
            <Plus className="size-4" />
            ACL
          </Button>
          {Boolean(group.isBrokerManaged) && (
            <Button asChild variant="ghost">
              <Link
                onClick={(e) => e.stopPropagation()}
                params={{ userName: encodeURIComponent(parsed.name) }}
                to="/security/users/$userName"
              >
                <ExternalLink className="size-4" />
                View user
              </Link>
            </Button>
          )}
        </div>
      </button>

      {/* Group body */}
      {!collapsed && (
        <div className="border-t">
          {hasAcls ? (
            <table className="w-full table-fixed">
              <thead>
                <tr className="text-left font-medium text-muted-foreground/70 text-sm uppercase tracking-wider">
                  <th className="w-[14%] px-4 py-1.5">Type</th>
                  <th className="w-auto px-4 py-1.5">Resource</th>
                  <th className="w-[11%] px-4 py-1.5">Operation</th>
                  <th className="w-[10%] px-4 py-1.5">Permission</th>
                  <th className="w-[9%] px-4 py-1.5">Host</th>
                  <th className="w-[44px] px-2 py-1.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.directAcls.map((acl, idx) => (
                  <ACLRow
                    acl={acl}
                    key={`direct-${acl.resourceType}-${acl.resourceName}-${idx}`}
                    onRemove={() => onRemove(acl)}
                  />
                ))}

                {group.inheritedAcls.length > 0 && (
                  <tr>
                    <td className="p-0" colSpan={6}>
                      <div className="flex items-center gap-2 bg-muted/50 px-4 py-1.5">
                        <Lock className="size-3 shrink-0 text-muted-foreground/70" />
                        <span className="font-medium text-muted-foreground/70 text-sm uppercase tracking-wider">
                          Via {group.assignedRoles.length === 1 ? 'role' : 'roles'}
                        </span>
                        {group.assignedRoles.slice(0, 3).map((role) => (
                          <Link
                            key={role.name}
                            onClick={(e) => e.stopPropagation()}
                            params={{ roleName: encodeURIComponent(role.name) }}
                            to="/security/roles/$roleName"
                          >
                            <Badge
                              className="font-normal text-sm transition-colors hover:bg-accent-foreground/25"
                              variant="secondary"
                            >
                              {role.name}
                            </Badge>
                          </Link>
                        ))}
                        {group.assignedRoles.length > 3 && (
                          <span className="text-muted-foreground text-sm">+{group.assignedRoles.length - 3} more</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {group.inheritedAcls.map((acl, idx) => (
                  <ACLRow acl={acl} inherited key={`inherited-${acl.roleName}-${idx}`} />
                ))}
              </tbody>
            </table>
          ) : (
            <Empty className="py-8">
              <EmptyMedia variant="icon">
                <Shield className="size-6" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No ACLs defined</EmptyTitle>
                <EmptyDescription>No ACLs defined for this principal.</EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => onCreate(group.principal)}>
                <Plus className="size-4" />
                Add ACL
              </Button>
            </Empty>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared ACL Row ─────────────────────────────────────────────────────────

function ACLRow({
  acl,
  inherited,
  onRemove,
}: {
  acl: {
    resourceType: string;
    resourceName: string;
    operation: string;
    permission: string;
    host: string;
    resourcePatternType?: number;
  };
  inherited?: boolean;
  onRemove?: () => void;
}) {
  return (
    <tr className={`border-b last:border-0 ${inherited ? 'bg-muted/10' : ''}`}>
      <td className="px-4 py-1.5">
        <Badge
          className={`font-normal text-sm ${inherited ? 'border-muted-foreground/20 text-muted-foreground' : ''}`}
          variant="outline"
        >
          {acl.resourceType}
        </Badge>
      </td>
      <td className="max-w-0 px-4 py-1.5">
        <span className="flex items-center gap-1.5">
          <span
            className={`truncate font-mono text-base ${inherited ? 'text-muted-foreground' : ''}`}
            title={acl.resourceName}
          >
            {truncateText(acl.resourceName, RESOURCE_NAME_MAX)}
          </span>
          {Boolean(getPatternTypeLabel(acl.resourcePatternType)) && (
            <Badge className={`shrink-0 font-normal text-xs ${inherited ? 'opacity-50' : ''}`} variant="secondary">
              {getPatternTypeLabel(acl.resourcePatternType)}
            </Badge>
          )}
        </span>
      </td>
      <td className={`px-4 py-1.5 text-base ${inherited ? 'text-muted-foreground' : ''}`}>{acl.operation}</td>
      <td className="px-4 py-1.5">
        <span className={`font-medium text-base ${getPermissionColorClass(acl.permission, Boolean(inherited))}`}>
          {acl.permission}
        </span>
      </td>
      <td className={`px-4 py-1.5 font-mono text-base ${inherited ? 'text-muted-foreground' : ''}`}>{acl.host}</td>
      <td className="px-2 py-1.5">
        {inherited ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex size-7 items-center justify-center">
                  <Lock className="size-3 text-muted-foreground/30" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-sm">Inherited from a role. Edit on the role page.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Remove ACL</span>
          </Button>
        )}
      </td>
    </tr>
  );
}
