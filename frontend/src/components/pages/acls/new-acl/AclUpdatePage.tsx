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
  PrincipalTypeUser,
  parsePrincipal,
  type Rule,
  type SharedConfig,
} from 'components/pages/acls/new-acl/ACL.model';
import CreateACL from 'components/pages/acls/new-acl/CreateACL';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../../react-query/api/acl';
import { uiState } from '../../../../state/uiState';
import PageContent from '../../../misc/PageContent';

const AclUpdatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { aclName = '' } = useParams<{ aclName: string }>();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: aclName, linkTo: `/security/acls/${aclName}/details` },
      { title: 'Update ACL', linkTo: '', heading: '' },
    ];
  }, [aclName]);

  // Fetch existing ACL data
  const { data, isLoading } = useGetAclsByPrincipal(`User:${aclName}`);

  const { applyUpdates } = useUpdateAclMutation();

  const updateAclMutation =
    (actualRules: Rule[], sharedConfig: SharedConfig) => async (_: string, _2: string, rules: Rule[]) => {
      const applyResult = await applyUpdates(actualRules, sharedConfig, rules);
      handleResponses(toast, applyResult.errors, applyResult.created);

      navigate(`/security/acls/${parsePrincipal(sharedConfig.principal).name}/details`);
    };

  if (isLoading || !data) {
    return (
      <PageContent>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading ACL configuration...</div>
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
        onSubmit={updateAclMutation(data.rules, data.sharedConfig)}
        onCancel={() => navigate(`/security/acls/${aclName}/details`)}
        rules={rulesWithAllOperations}
        sharedConfig={data.sharedConfig}
        edit={true}
        principalType={PrincipalTypeUser}
      />
    </PageContent>
  );
};

export default AclUpdatePage;
