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

import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@redpanda-data/ui';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  convertRulesToCreateACLRequests,
  PrincipalTypeRedpandaRole,
  type Rule,
} from '@/components/pages/acls/new-acl/ACL.model';
import CreateACL from '@/components/pages/acls/new-acl/CreateACL';
import { createACL } from '@/protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { createRole } from '@/protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { type CreateRoleRequest, SecurityService } from '@/protogen/redpanda/api/dataplane/v1/security_pb';
import { ACLService } from '@/protogen/redpanda/api/dataplane/v1/acl_pb';
import { uiState } from '../../../state/uiState';
import PageContent from '../../misc/PageContent';

const RoleCreatePage = () => {
  const toast = useToast();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: '', linkTo: '/security/roles/create', heading: 'Create Role' },
    ];
  }, []);

  const { mutateAsync: createRoleMutation } = useMutation(createRole);
  const { mutateAsync: createACLMutation } = useMutation(createACL);

  const createRoleAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    // Extract the role name from the principal (format: "RedpandaRole:roleName")
    const roleName = principal.split(':')[1];

    if (!roleName || roleName.trim() === '') {
      toast({
        status: 'error',
        description: 'Please enter a role name',
      });
      return;
    }

    try {
      // First create the role
      await createRoleMutation({
        role: {
          name: roleName,
        },
      } as CreateRoleRequest);

      toast({
        status: 'success',
        description: `Role "${roleName}" created successfully`,
      });

      // Invalidate the role list query cache
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService,
          cardinality: 'finite',
        }),
      });

      // Then create the ACLs for the role
      const result = convertRulesToCreateACLRequests(rules, principal, host);

      const results = await Promise.all(
        result.map((r) => {
          return createACLMutation(r);
        }),
      );

      // TODO: handle partial failures
      console.log(results);
      toast({
        status: 'success',
        description: 'Role ACLs created successfully',
      });

      // Invalidate the listACLs query cache to force fresh data on next request
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService,
          cardinality: 'finite',
        }),
      });

      nav(`/security/roles/${roleName}/details`);
    } catch (error) {
      toast({
        status: 'error',
        description: `Failed to create role: ${error}`,
      });
    }
  };

  return (
    <PageContent>
      <CreateACL
        onSubmit={createRoleAclMutation}
        onCancel={() => nav('/security/roles')}
        edit={false}
        principalType={PrincipalTypeRedpandaRole}
      />
    </PageContent>
  );
};

export default RoleCreatePage;
