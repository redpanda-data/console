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

import { UpdateRoleMembershipRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/security_pb';
import { useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { rolesApi } from '../../../../state/backend-api';
import { Button } from '../../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';

type Role = {
  principalType: string;
  principalName: string;
};

type UserRolesCardProps = {
  roles: Role[];
  onChangeRoles?: () => void;
  userName?: string;
};

export const UserRolesCard = ({ roles, onChangeRoles, userName }: UserRolesCardProps) => {
  const navigate = useNavigate();
  const { mutateAsync: updateRoleMembership } = useUpdateRoleMembershipMutation();

  const removeFromRole = async (roleName: string) => {
    if (!userName) return;
    const membership = create(UpdateRoleMembershipRequestSchema, {
      roleName,
      remove: [{ principal: userName }],
    });
    await updateRoleMembership(membership);
    await Promise.all([rolesApi.refreshRoles(), rolesApi.refreshRoleMembers()]);
  };

  const count = roles.length;
  const headerTitle = count > 0 ? `Roles ${count} assigned` : 'Roles';

  return (
    <Card size="full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{headerTitle}</CardTitle>
        <CardAction>
          {Boolean(onChangeRoles) && (
            <Button
              onClick={onChangeRoles}
              testId={count > 0 ? 'change-role-button' : 'assign-role-button'}
              variant="outline"
            >
              Assign a role...
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p>No permissions assigned to this user.</p>
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
      </CardContent>
    </Card>
  );
};
