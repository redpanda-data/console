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
  getAclFromAclListResponse,
  getOperationsForResourceType,
  handleResponses,
  handleUrlWithHost,
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
import { HostSelector } from 'components/pages/acls/new-acl/HostSelector';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../../react-query/api/acl';
import { uiState } from '../../../../state/uiState';
import PageContent from '../../../misc/PageContent';

const AclUpdatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { aclName = '' } = useParams<{ aclName: string }>();
  const [searchParams] = useSearchParams();
  const host = searchParams.get('host') ?? undefined;

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: aclName, linkTo: `/security/acls/${aclName}/details` },
      { title: 'Update ACL', linkTo: '', heading: '' },
    ];
  }, [aclName]);

  // Fetch existing ACL data
  const { data, isLoading } = useGetAclsByPrincipal(`User:${aclName}`, host, (response) => {
    const possibleHosts = response.resources.reduce<Set<string>>((uniqueHosts, resource) => {
      resource.acls.forEach((acl) => {
        uniqueHosts.add(acl.host);
      });
      return uniqueHosts;
    }, new Set<string>());

    const aclDetails = getAclFromAclListResponse(response);
    // When host filter is provided, we expect only one AclDetail in the array
    return { acls: aclDetails[0], hosts: Array.from(possibleHosts) };
  });

  const { applyUpdates } = useUpdateAclMutation();

  const { acls, hosts } = data ?? { acls: undefined, hosts: [] };

  const updateAclMutation =
    (actualRules: Rule[], sharedConfig: SharedConfig) => async (_: string, _2: string, rules: Rule[]) => {
      const applyResult = await applyUpdates(actualRules, sharedConfig, rules);
      handleResponses(toast, applyResult.errors, applyResult.created);

      const detailsPath = `/security/acls/${aclName}/details`;
      navigate(handleUrlWithHost(detailsPath, host));
    };

  if (isLoading || !acls) {
    return (
      <PageContent>
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading ACL configuration...</div>
        </div>
      </PageContent>
    );
  }

  if (!!hosts && hosts.length > 1) {
    return (
      <PageContent>
        <HostSelector principalName={aclName} hosts={hosts} baseUrl={`/security/acls/${aclName}/update`} />
      </PageContent>
    );
  }

  // Ensure all operations are present for each rule
  const rulesWithAllOperations = acls.rules.map((rule) => {
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
        onSubmit={updateAclMutation(acls.rules, acls.sharedConfig)}
        onCancel={() => navigate(handleUrlWithHost(`/security/acls/${aclName}/details`, host))}
        rules={rulesWithAllOperations}
        sharedConfig={acls.sharedConfig}
        edit={true}
        principalType={PrincipalTypeUser}
      />
    </PageContent>
  );
};

export default AclUpdatePage;
