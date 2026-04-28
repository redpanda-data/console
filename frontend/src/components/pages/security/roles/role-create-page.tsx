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
import { CardField } from 'components/redpanda-ui/components/card';
import { FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { useLayoutEffect } from 'react';
import { toast } from 'sonner';

import { useCreateAcls } from '../../../../react-query/api/acl';
import { useCreateRoleMutation } from '../../../../react-query/api/security';
import { setPageHeader } from '../../../../state/ui-state';
import CreateACL from '../acls/create-acl';
import {
  convertRulesToCreateACLRequests,
  handleResponses,
  PrincipalTypeRedpandaRole,
  parsePrincipal,
  type Rule,
} from '../shared/acl-model';

const RoleCreatePage = () => {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    setPageHeader('Roles', [
      { title: 'Security', linkTo: '/security/users' },
      { title: 'Roles', linkTo: '/security/roles' },
    ]);
  }, []);

  const { createAcls } = useCreateAcls();
  const { mutateAsync: createRole } = useCreateRoleMutation();

  const createRoleAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    // Extract the role name from the principal (format: "RedpandaRole:roleName")
    const roleName = parsePrincipal(principal).name;

    if (!roleName || roleName.trim() === '') {
      toast.error('Please enter a role name');
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

      toast.success(`Role "${roleName}" created successfully`);

      // Then create the ACLs for the role
      const result = convertRulesToCreateACLRequests(rules, principal, host);
      const applyResult = await createAcls(result);
      handleResponses(applyResult.errors, applyResult.created);

      navigate({ to: `/security/roles/${roleName}/details` });
    } catch (error) {
      toast.error(`Failed to create role: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">Create role</h2>
      <CreateACL
        edit={false}
        onCancel={() => navigate({ to: '/security/roles' })}
        onSubmit={createRoleAclMutation}
        principalType={PrincipalTypeRedpandaRole}
        renderPrincipal={({ value, onChange, error }) => (
          <CardField>
            <FieldLabel htmlFor="principal">Role name</FieldLabel>
            <Input
              id="principal"
              onChange={(e) => onChange(`RedpandaRole:${e.target.value}`)}
              placeholder="analytics-writer"
              testId="shared-principal-input"
              value={parsePrincipal(value).name}
            />
            {error && <FieldError>{error}</FieldError>}
          </CardField>
        )}
      />
    </div>
  );
};

export default RoleCreatePage;
