/**
 * Copyright 2025 Redpanda Data, Inc.
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
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { useMemo } from 'react';

import { UpdateRoleMembershipRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/security_pb';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { rolesApi } from '../../../../state/backend-api';
import { Button } from '../../../redpanda-ui/components/button';
import { Combobox } from '../../../redpanda-ui/components/combobox';
import { ListLayout, ListLayoutContent, ListLayoutFilters } from '../../../redpanda-ui/components/list-layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';

type Role = {
  principalType: string;
  principalName: string;
};

type UserRolesCardProps = {
  roles: Role[];
  userName?: string;
};

export const UserRolesCard = ({ roles, userName }: UserRolesCardProps) => {
  const navigate = useNavigate();
  const { mutateAsync: updateRoleMembership } = useUpdateRoleMembershipMutation();
  const { data: rolesData } = useListRolesQuery();

  const assignedRoleNames = useMemo(() => new Set(roles.map((r) => r.principalName)), [roles]);

  const availableRoleOptions = useMemo(
    () =>
      (rolesData?.roles ?? [])
        .filter((r) => !assignedRoleNames.has(r.name))
        .map((r) => ({ value: r.name, label: r.name })),
    [rolesData, assignedRoleNames]
  );

  const removeFromRole = async (roleName: string) => {
    if (!userName) return;
    await updateRoleMembership(
      create(UpdateRoleMembershipRequestSchema, { roleName, remove: [{ principal: userName }] })
    );
    await Promise.all([rolesApi.refreshRoles(), rolesApi.refreshRoleMembers()]);
  };

  const assignRole = async (roleName: string) => {
    if (!(userName && roleName)) return;
    await updateRoleMembership(create(UpdateRoleMembershipRequestSchema, { roleName, add: [{ principal: userName }] }));
    await Promise.all([rolesApi.refreshRoles(), rolesApi.refreshRoleMembers()]);
  };

  const count = roles.length;

  return (
    <ListLayout className="min-h-0 gap-3 py-0">
      <ListLayoutFilters
        actions={
          userName ? (
            <Combobox
              className="w-56"
              clearable={false}
              onChange={assignRole}
              options={availableRoleOptions}
              placeholder="Assign a role..."
              testId="assign-role-combobox"
              value=""
            />
          ) : undefined
        }
      >
        <h2 className="font-semibold text-base">Roles</h2>
      </ListLayoutFilters>
      <ListLayoutContent>
        {count === 0 ? (
          <p>No roles assigned to this user.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.principalName}>
                  <TableCell testId={`role-name-${r.principalName}`}>{r.principalName}</TableCell>
                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      {Boolean(userName) && (
                        <Button
                          onClick={() => removeFromRole(r.principalName)}
                          size="icon-sm"
                          testId={`remove-role-${r.principalName}`}
                          variant="ghost"
                        >
                          <Trash2Icon className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        onClick={() => navigate({ to: `/security/roles/${r.principalName}/details` })}
                        size="icon-sm"
                        testId={`view-role-${r.principalName}`}
                        variant="ghost"
                      >
                        <ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListLayoutContent>
    </ListLayout>
  );
};
