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
import { useNavigate } from '@tanstack/react-router';
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
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { MoreHorizontal, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { useMemo, useState } from 'react';
import { useCreateRoleMutation, useDeleteRoleMutation, useListRolesQuery } from 'react-query/api/security';
import { toast } from 'sonner';

export function RolesTab() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<{ name: string; memberCount: number } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: rolesData } = useListRolesQuery();
  const { mutateAsync: createRole } = useCreateRoleMutation();
  const { mutateAsync: deleteRole } = useDeleteRoleMutation();

  const roles = useMemo(() => rolesData?.roles ?? [], [rolesData]);

  const filteredRoles = useMemo(() => {
    if (!searchQuery) {
      return roles;
    }
    const q = searchQuery.toLowerCase();
    return roles.filter((role) => role.name.toLowerCase().includes(q));
  }, [roles, searchQuery]);

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
      await deleteRole({ roleName: deleteConfirmRole.name });
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
    navigate({ to: '/security/roles/$roleName', params: { roleName: encodeURIComponent(roleName) } });
  };

  return (
    <div aria-labelledby="roles-tab" id="roles-panel" role="tabpanel">
      <p className="mb-6 max-w-3xl text-muted-foreground text-sm leading-relaxed">
        Roles are groups of access control lists (ACLs) that can be assigned to principals. A principal represents any
        entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user, OIDC
        identity, or mTLS client).
      </p>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search roles"
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Role name</TableHead>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => setDeleteConfirmRole({ name: role.name, memberCount: 0 })}
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Shield className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">{searchQuery ? 'No roles found' : 'No roles yet'}</p>
            <p className="mt-1 max-w-xs text-muted-foreground text-sm">
              {searchQuery
                ? 'Try adjusting your search query.'
                : 'Create your first role to group ACLs and assign them to principals.'}
            </p>
            {!searchQuery && (
              <Button
                className="mt-4"
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
          </div>
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
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Create a new role to group ACLs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name</Label>
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
      <Dialog onOpenChange={(open) => !open && setDeleteConfirmRole(null)} open={Boolean(deleteConfirmRole)}>
        <DialogContent className="sm:max-w-sm">
          {deleteConfirmRole && (
            <>
              <DialogHeader>
                <DialogTitle>Delete Role</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the role{' '}
                  <span className="font-medium text-foreground">{deleteConfirmRole.name}</span>?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setDeleteConfirmRole(null)} variant="outline">
                  Cancel
                </Button>
                <Button disabled={isDeleting} onClick={handleDeleteRole} variant="destructive">
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
