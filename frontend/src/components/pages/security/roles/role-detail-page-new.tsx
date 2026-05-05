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
import { getRouteApi } from '@tanstack/react-router';
import { Trash2, Users2Icon } from 'lucide-react';
import {
  ListRoleMembersRequestSchema,
  UpdateRoleMembershipRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { ListUsersRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useLayoutEffect, useState } from 'react';
import { toast } from 'sonner';

import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { useListRoleMembersQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { setPageHeader } from '../../../../state/ui-state';
import { Button } from '../../../redpanda-ui/components/button';
import { Combobox } from '../../../redpanda-ui/components/combobox';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../../redpanda-ui/components/empty';
import { ListLayout, ListLayoutContent, ListLayoutFilters } from '../../../redpanda-ui/components/list-layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Heading } from '../../../redpanda-ui/components/typography';
import { parsePrincipal } from '../shared/acl-model';
import { AclsCard } from '../shared/acls-card';

const routeApi = getRouteApi('/security/roles/$roleName/details');

export const RoleDetailPageNew = () => {
  const { roleName } = routeApi.useParams();
  const [deletingPrincipal, setDeletingPrincipal] = useState<string | null>(null);

  useLayoutEffect(() => {
    setPageHeader(
      roleName,
      [
        { title: 'Security', linkTo: '/security/users' },
        { title: 'Roles', linkTo: '/security/roles' },
        { title: roleName, linkTo: `/security/roles/${roleName}/details` },
      ],
      { title: 'Roles', linkTo: '/security/roles' }
    );
  }, [roleName]);

  const { data: aclData, isLoading: isAclsLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`);

  const { data: membersData, isLoading: membersLoading } = useListRoleMembersQuery(
    create(ListRoleMembersRequestSchema, { roleName })
  );
  const { data: usersData } = useListUsersQuery(create(ListUsersRequestSchema));
  const { mutateAsync: updateMembership, isPending: isSubmitting } = useUpdateRoleMembershipMutation();

  const allMembers = membersData?.members ?? [];

  const assignedPrincipals = new Set(allMembers.map((m) => m.principal));

  const availablePrincipalOptions = (usersData?.users ?? [])
    .filter((u) => !assignedPrincipals.has(`User:${u.name}`))
    .map((u) => ({ value: u.name, label: u.name }));

  const addMember = async (userName: string) => {
    if (!userName) return;
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [{ principal: `User:${userName}` }],
          remove: [],
          create: true,
        })
      );
      toast.success(`User "${userName}" added to role successfully`);
    } catch {
      // Error handled by onError in mutation
    }
  };

  const handleRemoveMember = async (memberPrincipal: string) => {
    setDeletingPrincipal(memberPrincipal);
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [],
          remove: [{ principal: memberPrincipal }],
          create: false,
        })
      );
      toast.success(`User "${parsePrincipal(memberPrincipal).name}" removed from role`);
    } catch {
      // Error handled by onError in mutation
    } finally {
      setDeletingPrincipal(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <AclsCard acls={aclData} isLoading={isAclsLoading} principal={`RedpandaRole:${roleName}`} />

      {/* Principals */}
      <ListLayout className="min-h-0 gap-3 py-0">
        <ListLayoutFilters
          actions={
            <Combobox
              className="w-56"
              clearable={false}
              disabled={isSubmitting}
              onChange={addMember}
              options={availablePrincipalOptions}
              placeholder="Add a principal..."
              testId="add-principal-combobox"
              value=""
            />
          }
        >
          <Heading as="h2" level={4}>
            Principals
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
            <TableBody>
              {membersLoading ? (
                <TableRow>
                  <TableCell className="py-4 text-center text-muted-foreground text-sm" colSpan={2}>
                    Loading members...
                  </TableCell>
                </TableRow>
              ) : allMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users2Icon />
                        </EmptyMedia>
                        <EmptyTitle>No principals assigned</EmptyTitle>
                        <EmptyDescription>
                          Assign users to this role to grant them its permissions. Use the dropdown above to add a
                          principal.
                        </EmptyDescription>
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
              ) : (
                allMembers.map((member) => {
                  const parsed = parsePrincipal(member.principal);
                  const displayName = parsed.name || member.principal;
                  return (
                    <TableRow key={member.principal}>
                      <TableCell className="font-mono">{displayName}</TableCell>
                      <TableCell align="right">
                        <Button
                          data-testid={`remove-${parsed.type.toLowerCase()}-${displayName}-button`}
                          disabled={deletingPrincipal === member.principal || isSubmitting}
                          onClick={() => handleRemoveMember(member.principal)}
                          size="icon-sm"
                          variant="destructive-ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ListLayoutContent>
      </ListLayout>
    </div>
  );
};
