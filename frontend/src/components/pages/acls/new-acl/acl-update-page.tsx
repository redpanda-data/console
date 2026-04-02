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
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/security/acls/$aclName/update');

import {
  getOperationsForResourceType,
  handleResponses,
  ModeAllowAll,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  type PrincipalType,
  type Rule,
} from 'components/pages/acls/new-acl/acl.model';
import CreateACL from 'components/pages/acls/new-acl/create-acl';
import { HostSelector } from 'components/pages/acls/new-acl/host-selector';
import { useEffect } from 'react';

import { parsePrincipalFromParam } from './principal-utils';
import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../../react-query/api/acl';
import { uiState } from '../../../../state/ui-state';
import PageContent from '../../../misc/page-content';

const AclUpdatePage = () => {
  const toast = useToast();
  const navigate = useNavigate({ from: '/security/acls/$aclName/update' });
  const { aclName } = routeApi.useParams();
  const search = routeApi.useSearch();
  const host = search.host ?? undefined;

  const { principalType, principalName } = parsePrincipalFromParam(aclName);

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: principalName, linkTo: `/security/acls/${aclName}/details` },
      { title: 'Update ACL', linkTo: '', heading: '' },
    ];
  }, [aclName, principalName]);

  // Fetch existing ACL data
  const { data, isLoading } = useGetAclsByPrincipal(`${principalType}:${principalName}`, host);

  const { applyUpdates } = useUpdateAclMutation();

  const [acls, ...hosts] = data || [];

  const handleUpdate = async (_principal: string, _host: string, rules: Rule[]) => {
    if (!acls) {
      return;
    }
    const applyResult = await applyUpdates(acls.rules, acls.sharedConfig, rules);
    handleResponses(toast, applyResult.errors, applyResult.created);

    navigate({
      to: `/security/acls/${aclName}/details`,
      search: { host },
    });
  };

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading ACL configuration...</div>
        </div>
      </PageContent>
    );
  }

  if (!(acls && data)) {
    return <div>No ACL data found</div>;
  }

  if (hosts.length > 1) {
    return (
      <PageContent>
        <HostSelector baseUrl={`/security/acls/${aclName}/update`} hosts={data} principalName={principalName} />
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
        edit
        onCancel={() =>
          navigate({
            to: `/security/acls/${aclName}/details`,
            search: { host },
          })
        }
        onSubmit={handleUpdate}
        principalType={`${principalType}:` as PrincipalType}
        rules={rulesWithAllOperations}
        sharedConfig={acls.sharedConfig}
      />
    </PageContent>
  );
};

export default AclUpdatePage;
