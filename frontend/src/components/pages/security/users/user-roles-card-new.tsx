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
import { Link } from '@tanstack/react-router';
import { ShieldIcon } from 'components/icons';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react';

import { UpdateRoleMembershipRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/security_pb';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { rolesApi } from '../../../../state/backend-api';
import { Button } from '../../../redpanda-ui/components/button';
import { Combobox } from '../../../redpanda-ui/components/combobox';
import { ListLayout, ListLayoutContent, ListLayoutFilters } from '../../../redpanda-ui/components/list-layout';
import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Heading } from '../../../redpanda-ui/components/typography';

type Role = {
  principalType: string;
  principalName: string;
};

type UserRolesCardNewProps = {
  roles: Role[];
  userName?: string;
  isLoading?: boolean;
};

export const UserRolesCardNew = ({ roles, userName, isLoading }: UserRolesCardNewProps) => {
  const { mutateAsync: updateRoleMembership } = useUpdateRoleMembershipMutation();
  const { data: rolesData } = useListRolesQuery();

  const assignedRoleNames = new Set(roles.map((r) => r.principalName));

  const availableRoleOptions = (rolesData?.roles ?? [])
    .filter((r) => !assignedRoleNames.has(r.name))
    .map((r) => ({ value: r.name, label: r.name }));

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

  const renderBody = () => {
    if (isLoading) {
      return [0, 1, 2].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton variant="text" width="md" />
          </TableCell>
          <TableCell />
        </TableRow>
      ));
    }
    if (count === 0) {
      return (
        <TableRow>
          <TableCell colSpan={2}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldIcon />
                </EmptyMedia>
                <EmptyTitle>No roles assigned</EmptyTitle>
                <EmptyDescription>Assign a role to grant this user permissions on cluster resources.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="link">
                  <a
                    href="https://docs.redpanda.com/current/manage/security/authorization/rbac/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Read the docs →
                  </a>
                </Button>
              </EmptyContent>
            </Empty>
          </TableCell>
        </TableRow>
      );
    }
    return roles.map((r) => (
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
            <Button asChild size="icon-sm" testId={`view-role-${r.principalName}`} variant="ghost">
              <Link params={{ roleName: r.principalName }} to="/security/roles/$roleName/details">
                <ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  };

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
        <Heading as="h2" level={4}>
          Roles
        </Heading>
      </ListLayoutFilters>
      <ListLayoutContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead align="right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderBody()}</TableBody>
        </Table>
      </ListLayoutContent>
    </ListLayout>
  );
};
