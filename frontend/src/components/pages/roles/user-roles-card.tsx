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

import { Eye, EyeOff, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import { Button } from '../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { getRuleDataTestId, handleUrlWithHost } from '../acls/new-acl/acl.model';
import { OperationsBadge } from '../acls/new-acl/operations-badge';

type Role = {
  principalType: string;
  principalName: string;
};

type UserRolesCardProps = {
  roles: Role[];
  onChangeRoles?: () => void;
};

type RoleTableRowProps = {
  role: Role;
  isExpanded: boolean;
  onToggle: () => void;
};

const RoleTableRow = ({ role, isExpanded, onToggle }: RoleTableRowProps) => {
  const navigate = useNavigate();
  const { data: acls, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${role.principalName}`, undefined, undefined, {
    enabled: isExpanded,
  });
  const rowKey = role.principalName;

  return [
    <TableRow className="hover:bg-gray-50" key={`role-${rowKey}`}>
      <TableCell testId={`role-name-${rowKey}`}>{role.principalName}</TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onToggle} size="sm" testId={`toggle-role-${rowKey}`} variant="outline">
            {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              navigate(handleUrlWithHost(`/security/roles/${role.principalName}/details`, ''));
            }}
            size="sm"
            testId={`view-role-${rowKey}`}
            variant="outline"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>,
    isLoading && (
      <TableRow>
        <TableCell>
          <Skeleton />
        </TableCell>
        <TableCell>
          <Skeleton />
        </TableCell>
      </TableRow>
    ),
    !isLoading && isExpanded && acls && acls.length > 0 && (
      <TableRow key={`role-${rowKey}-expanded`}>
        <TableCell className="bg-gray-50 p-6" colSpan={2}>
          <div className="space-y-4">
            <div className="font-semibold text-gray-700 text-sm">
              ACL Rules ({acls.reduce((sum, acl) => sum + acl.rules.length, 0)})
            </div>
            {acls.map((acl) => (
              <div key={`${acl.sharedConfig.principal}-${acl.sharedConfig.host}`}>
                <div className="mb-2 text-gray-600 text-xs">Host: {acl.sharedConfig.host}</div>
                {acl.rules.map((rule) => (
                  <div
                    className="rounded-lg border border-gray-200 bg-white p-4"
                    data-testid={`rule-${getRuleDataTestId(rule)}`}
                    key={rule.id}
                  >
                    <OperationsBadge rule={rule} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </TableCell>
      </TableRow>
    ),
  ];
};

export const UserRolesCard = ({ roles, onChangeRoles }: UserRolesCardProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (roles.length === 0) {
    return (
      <Card size="full">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Roles</CardTitle>
          <CardAction>
            {Boolean(onChangeRoles) && (
              <Button onClick={onChangeRoles} testId="assign-role-button" variant="outline">
                Assign role
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
          {Boolean(onChangeRoles) && (
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
            {roles.flatMap((r) => {
              const rowKey = r.principalName;
              const isExpanded = expandedRows.has(rowKey);

              return (
                <RoleTableRow
                  isExpanded={isExpanded}
                  key={`role-${rowKey}`}
                  onToggle={() => toggleRow(rowKey)}
                  role={r}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
