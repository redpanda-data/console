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
  handleResponses,
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
      const applyResult = await applyUpdates(actualRules, sharedConfig, rules);
      handleResponses(toast, applyResult.errors, applyResult.created);

      navigate(`/security/roles/${roleName}/details`);
    };

  if (isLoading || !data) {
    return (
      <PageContent>
        <div className="flex h-96 items-center justify-center">
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
      for (const [op, value] of Object.entries(rule.operations)) {
        if (op in mergedOperations) {
          mergedOperations[op] = value;
        }
      }
    }

    return {
      ...rule,
      operations: mergedOperations,
    };
  });

  return (
    <PageContent>
      <CreateACL
        edit={true}
        onCancel={() => navigate(`/security/roles/${roleName}/details`)}
        onSubmit={updateRoleAclMutation(data.rules, data.sharedConfig)}
        principalType={PrincipalTypeRedpandaRole}
        rules={rulesWithAllOperations}
        sharedConfig={data.sharedConfig}
      />
    </PageContent>
  );
};

export default RoleUpdatePage;
