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

import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/security/acls/$aclName/update');

import CreateACL from './create-acl';
import { HostSelector } from './host-selector';
import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../../react-query/api/acl';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import {
  getOperationsForResourceType,
  handleResponses,
  ModeAllowAll,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  type PrincipalType,
  PrincipalTypeGroup,
  PrincipalTypeRedpandaRole,
  PrincipalTypeUser,
  type Rule,
} from '../shared/acl-model';
import { parsePrincipalFromParam } from '../shared/principal-utils';

const VALID_PRINCIPAL_TYPES: Record<string, PrincipalType> = {
  User: PrincipalTypeUser,
  Group: PrincipalTypeGroup,
  RedpandaRole: PrincipalTypeRedpandaRole,
};

const AclUpdatePage = () => {
  const navigate = useNavigate({ from: '/security/acls/$aclName/update' });
  const { aclName } = routeApi.useParams();
  const search = routeApi.useSearch();
  const host = search.host ?? undefined;

  const { principalType, principalName } = parsePrincipalFromParam(aclName);

  useSecurityBreadcrumbs([
    { title: 'ACLs', linkTo: '/security/acls' },
    { title: principalName, linkTo: `/security/acls/${aclName}/details` },
  ]);

  // Fetch existing ACL data
  const { data, isLoading } = useGetAclsByPrincipal(`${principalType}:${principalName}`, host);

  const { applyUpdates } = useUpdateAclMutation();

  const [acls, ...hosts] = data || [];

  const handleUpdate = async (_principal: string, _host: string, rules: Rule[]) => {
    if (!acls) {
      return;
    }
    const applyResult = await applyUpdates(acls.rules, acls.sharedConfig, rules);
    handleResponses(applyResult.errors, applyResult.created);

    // Only navigate to the detail page on success. See UX-1218 — without this guard,
    // an update failure routes the user to the detail page as if the update had landed.
    if (!(applyResult.created && applyResult.errors.length === 0)) {
      return;
    }

    navigate({
      to: `/security/acls/${aclName}/details`,
      search: { host },
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading ACL configuration...</div>
        </div>
      </div>
    );
  }

  if (!(acls && data)) {
    return <div>No ACL data found</div>;
  }

  if (hosts.length > 1) {
    return (
      <div>
        <HostSelector baseUrl={`/security/acls/${aclName}/update`} hosts={data} principalName={principalName} />
      </div>
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
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">Update ACL: {principalName}</h2>
      <CreateACL
        edit
        onCancel={() =>
          navigate({
            to: `/security/acls/${aclName}/details`,
            search: { host },
          })
        }
        onSubmit={handleUpdate}
        principalType={VALID_PRINCIPAL_TYPES[principalType] ?? PrincipalTypeUser}
        rules={rulesWithAllOperations}
        sharedConfig={acls.sharedConfig}
      />
    </div>
  );
};

export default AclUpdatePage;
