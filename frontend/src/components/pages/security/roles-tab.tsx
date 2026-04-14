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
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { useRegexFilter } from 'hooks/use-regex-filter';
import { MoreHorizontal, Pencil, Plus, Search, Shield, Trash2, Users } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { getRole } from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { useMemo, useState } from 'react';
import { useCreateRoleMutation, useDeleteRoleMutation, useListRolesQuery } from 'react-query/api/security';
import { toast } from 'sonner';

import { sortByName } from './security-acl-utils';

export function RolesTab() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<{ name: string; memberCount: number } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: rolesData } = useListRolesQuery();
  const { mutateAsync: createRole } = useCreateRoleMutation();
  const { mutateAsync: deleteRole } = useDeleteRoleMutation();

  const roles = useMemo(() => sortByName(rolesData?.roles ?? []), [rolesData]);
  const transport = useTransport();
  const roleDetailsQueries = useQueries({
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

  const filteredRoles = useRegexFilter(roles, searchQuery, (role) => role.name);
  const memberCountByRole = useMemo(
    () => new Map(roles.map((role, index) => [role.name, roleDetailsQueries[index]?.data?.members?.length ?? 0])),
    [roleDetailsQueries, roles]
  );

  const handleCreateRole = async () => {
    const name = newRoleName.trim();
    if (!name) {
      setCreateError('Role name is required');
      return;
    }
    if (roles.some((r) => r.name === name)) {
      setCreateError('A role with this name already exists');
      return;
    }

    setIsCreating(true);
    try {
      await createRole(create(CreateRoleRequestSchema, { role: { name } }));
      toast.success(`Role "${name}" created`);
      setCreateDialogOpen(false);
      setNewRoleName('');
      setCreateError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create role';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteConfirmRole) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteRole({ deleteAcls: true, roleName: deleteConfirmRole.name });
      toast.success(`Role "${deleteConfirmRole.name}" deleted`);
      setDeleteConfirmRole(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete role';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const navigateToRole = (roleName: string) => {
    navigate({ to: '/security/roles/$roleName/details', params: { roleName: encodeURIComponent(roleName) } });
  };

  return (
    <div aria-labelledby="roles-tab" id="roles-panel" role="tabpanel">
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search roles"
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or regex..."
            type="text"
            value={searchQuery}
          />
        </div>
        <Button
          onClick={() => {
            setCreateDialogOpen(true);
            setNewRoleName('');
            setCreateError(null);
          }}
        >
          <Plus className="size-4" />
          Create role
        </Button>
      </div>

      {/* Roles Table */}
      <div className="rounded-lg border">
        {filteredRoles.length > 0 ? (
          <Table size="lg">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Role name</TableHead>
                <TableHead className="w-[160px]">Assigned principals</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role) => (
                <TableRow className="cursor-pointer" key={role.name} onClick={() => navigateToRole(role.name)}>
                  <TableCell className="py-1.5">
                    <span className="font-medium">{role.name}</span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-muted-foreground" />
                      <span className="tabular-nums">{memberCountByRole.get(role.name) ?? 0}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="size-8" size="icon" variant="ghost">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions for {role.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => navigateToRole(role.name)}>
                          <Pencil className="size-4" />
                          Edit role
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            setDeleteConfirmRole({
                              memberCount: memberCountByRole.get(role.name) ?? 0,
                              name: role.name,
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                          Delete role
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyMedia variant="icon">
              <Shield className="size-6" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{searchQuery ? 'No roles found' : 'No roles yet'}</EmptyTitle>
              <EmptyDescription>
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Create your first role to group ACLs and assign them to principals.'}
              </EmptyDescription>
            </EmptyHeader>
            {!searchQuery && (
              <Button
                onClick={() => {
                  setCreateDialogOpen(true);
                  setNewRoleName('');
                  setCreateError(null);
                }}
              >
                <Plus className="size-4" />
                Create role
              </Button>
            )}
          </Empty>
        )}
      </div>

      {filteredRoles.length > 0 && (
        <div className="mt-4 text-muted-foreground text-sm">
          {filteredRoles.length} {filteredRoles.length === 1 ? 'role' : 'roles'}
        </div>
      )}

      {/* Create Role Dialog */}
      <Dialog onOpenChange={(open) => !open && setCreateDialogOpen(false)} open={createDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader spacing="loose">
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Create a new role to group ACLs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="role-name">Role Name</Label>
                <Text variant="muted">Must not contain whitespace or special characters.</Text>
              </div>
              <Input
                autoComplete="off"
                id="role-name"
                onChange={(e) => {
                  setNewRoleName(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateRole();
                  }
                }}
                placeholder="e.g. producer, consumer, admin"
                type="text"
                value={newRoleName}
              />
              {Boolean(createError) && <p className="text-destructive text-sm">{createError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateDialogOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={isCreating} onClick={handleCreateRole}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmRole(null);
          }
        }}
        open={Boolean(deleteConfirmRole)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleteConfirmRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role and remove all its ACL bindings.
              {Boolean(deleteConfirmRole && deleteConfirmRole.memberCount > 0) &&
                ` ${deleteConfirmRole?.memberCount} assigned ${
                  deleteConfirmRole?.memberCount === 1 ? 'principal' : 'principals'
                } will lose the permissions granted by this role.`}{' '}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild disabled={isDeleting} onClick={handleDeleteRole}>
              <Button variant="destructive">{isDeleting ? 'Deleting...' : 'Delete Role'}</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
