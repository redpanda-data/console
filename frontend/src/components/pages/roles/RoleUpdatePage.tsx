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

import { useToast } from '@redpanda-data/ui';
import {
  getOperationsForResourceType,
  ModeAllowAll,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  PrincipalTypeRedpandaRole,
  type Rule,
  type SharedConfig,
} from 'components/pages/acls/new-acl/ACL.model';
import CreateACL from 'components/pages/acls/new-acl/CreateACL';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../react-query/api/acl';
import { uiState } from '../../../state/uiState';
import PageContent from '../../misc/PageContent';

const RoleUpdatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { roleName = '' } = useParams<{ roleName: string }>();

  const { applyUpdates } = useUpdateAclMutation();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: roleName, linkTo: `/security/roles/${roleName}/details` },
      { title: 'Update Role', linkTo: '', heading: '' },
    ];
  }, [roleName]);

  // Fetch existing ACL data for the role
  const { data, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`);

  const updateRoleAclMutation =
    (actualRules: Rule[], sharedConfig: SharedConfig) => async (_: string, _2: string, rules: Rule[]) => {
      await applyUpdates(actualRules, sharedConfig, rules);

      // TODO: handle partial failures
      toast({
        status: 'success',
        description: 'Role ACLs updated successfully',
      });

      navigate(`/security/roles/${roleName}/details`);
    };

  if (isLoading || !data) {
    return (
      <PageContent>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading role configuration...</div>
        </div>
      </PageContent>
    );
  }

  // Ensure all operations are present for each rule
  const rulesWithAllOperations = data.rules.map((rule) => {
    const allOperations = getOperationsForResourceType(rule.resourceType);
    let mergedOperations = { ...allOperations };

    // If mode is AllowAll or DenyAll, set all operations accordingly
    if (rule.mode === ModeAllowAll) {
      mergedOperations = Object.fromEntries(Object.keys(allOperations).map((op) => [op, OperationTypeAllow]));
    } else if (rule.mode === ModeDenyAll) {
      mergedOperations = Object.fromEntries(Object.keys(allOperations).map((op) => [op, OperationTypeDeny]));
    } else {
      // For custom mode, override with the actual values from the fetched rule
      Object.entries(rule.operations).forEach(([op, value]) => {
        if (op in mergedOperations) {
          mergedOperations[op] = value;
        }
      });
    }

    return {
      ...rule,
      operations: mergedOperations,
    };
  });

  return (
    <PageContent>
      <CreateACL
        onSubmit={updateRoleAclMutation(data.rules, data.sharedConfig)}
        onCancel={() => navigate(`/security/roles/${roleName}/details`)}
        rules={rulesWithAllOperations}
        sharedConfig={data.sharedConfig}
        edit={true}
        principalType={PrincipalTypeRedpandaRole}
      />
    </PageContent>
  );
};

export default RoleUpdatePage;
