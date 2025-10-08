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
import { useToast } from '@redpanda-data/ui';
import {
  convertRulesToCreateACLRequests,
  handleResponses,
  PrincipalTypeRedpandaRole,
  parsePrincipal,
  type Rule,
} from 'components/pages/acls/new-acl/acl.model';
import CreateACL from 'components/pages/acls/new-acl/create-acl';
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateAcls } from '../../../react-query/api/acl';
import { useCreateRoleMutation } from '../../../react-query/api/security';
import { uiState } from '../../../state/ui-state';
import PageContent from '../../misc/page-content';

const RoleCreatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: 'Create Role', linkTo: '' },
    ];
  }, []);

  const { createAcls } = useCreateAcls();
  const { mutateAsync: createRole } = useCreateRoleMutation();

  const createRoleAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    // Extract the role name from the principal (format: "RedpandaRole:roleName")
    const roleName = parsePrincipal(principal).name;

    if (!roleName || roleName.trim() === '') {
      toast({
        status: 'error',
        description: 'Please enter a role name',
      });
      return;
    }

    try {
      // First create the role
      await createRole(
        create(CreateRoleRequestSchema, {
          role: {
            name: roleName,
          },
        })
      );

      toast({
        status: 'success',
        description: `Role "${roleName}" created successfully`,
      });

      // Then create the ACLs for the role
      const result = convertRulesToCreateACLRequests(rules, principal, host);
      const applyResult = await createAcls(result);
      handleResponses(toast, applyResult.errors, applyResult.created);

      navigate(`/security/roles/${roleName}/details`);
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
        edit={false}
        onCancel={() => navigate('/security/roles')}
        onSubmit={createRoleAclMutation}
        principalType={PrincipalTypeRedpandaRole}
      />
    </PageContent>
  );
};

export default RoleCreatePage;
