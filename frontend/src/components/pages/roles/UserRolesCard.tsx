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

import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { handleUrlWithHost } from '../acls/new-acl/ACL.model';

interface Role {
  principalType: string;
  principalName: string;
}

interface UserRolesCardProps {
  roles: Role[];
  onChangeRoles?: () => void;
}

export const UserRolesCard = ({ roles, onChangeRoles }: UserRolesCardProps) => {
  const navigate = useNavigate();

  if (roles.length === 0) {
    return (
      <Card size="full">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Roles</CardTitle>
          <CardAction>
            {onChangeRoles && (
              <Button onClick={onChangeRoles} testId="assign-role-button" variant="outline">
                Assign Role
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>No permissions assigned to this user.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Roles</CardTitle>
        <CardAction>
          {onChangeRoles && (
            <Button onClick={onChangeRoles} testId="change-role-button" variant="outline">
              Change Role
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead align="right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => (
              <TableRow key={`role-${r.principalType}-${r.principalName}`}>
                <TableCell testId={`role-name-${r.principalName}`}>{r.principalName}</TableCell>
                <TableCell align="right">
                  <Button
                    onClick={() => {
                      navigate(handleUrlWithHost(`/security/roles/${r.principalName}/details`, ''));
                    }}
                    size="sm"
                    testId={`view-role-${r.principalName}`}
                    variant="outline"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
