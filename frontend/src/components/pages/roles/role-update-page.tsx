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

const routeApi = getRouteApi('/security/roles/$roleName/update');

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
} from 'components/pages/acls/new-acl/acl.model';
import CreateACL from 'components/pages/acls/new-acl/create-acl';
import { HostSelector } from 'components/pages/acls/new-acl/host-selector';
import { LockedPrincipalField } from 'components/pages/acls/new-acl/locked-principal-field';
import { toast } from 'sonner';

import { useGetAclsByPrincipal, useUpdateAclMutation } from '../../../react-query/api/acl';
import { useSecurityBreadcrumbs } from '../security/hooks/use-security-breadcrumbs';

const RoleUpdatePage = () => {
  const navigate = useNavigate({ from: '/security/roles/$roleName/update' });
  const { roleName } = routeApi.useParams();
  const search = routeApi.useSearch();
  const host = search.host ?? undefined;

  useSecurityBreadcrumbs([
    { title: 'Roles', linkTo: '/security/roles' },
    { title: roleName, linkTo: `/security/roles/${roleName}/details` },
  ]);

  const { applyUpdates } = useUpdateAclMutation();

  // Fetch existing ACL data for the role
  const { data, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`, host);

  const updateRoleAclMutation =
    (actualRules: Rule[], sharedConfig: SharedConfig) => async (_: string, _2: string, rules: Rule[]) => {
      try {
        const applyResult = await applyUpdates(actualRules, sharedConfig, rules);
        handleResponses(applyResult.errors, applyResult.created);

        navigate({
          to: `/security/roles/${roleName}/details`,
          search: { host },
        });
      } catch (error) {
        toast.error(`Failed to update role ACLs: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

  if (isLoading) {
    return (
      <div>
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading role configuration...</div>
        </div>
      </div>
    );
  }

  // If multiple hosts exist and no host is selected, show host selector
  if (data && data.length > 1 && !host) {
    return (
      <div>
        <HostSelector baseUrl={`/security/roles/${roleName}/update`} hosts={data} principalName={roleName} />
      </div>
    );
  }

  const acl = data && data.length > 0 ? (host ? data.find((d) => d.sharedConfig.host === host) : data[0]) : null;

  const emptySharedConfig = { principal: `${PrincipalTypeRedpandaRole}${roleName}`, host: host ?? '*' };

  // Ensure all operations are present for each rule
  const rulesWithAllOperations = (acl?.rules ?? []).map((rule) => {
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
      <h2 className="pt-4 pb-3 font-semibold text-xl">Update role: {roleName}</h2>
      <CreateACL
        edit={true}
        onCancel={() =>
          navigate({
            to: `/security/roles/${roleName}/details`,
            search: { host },
          })
        }
        onSubmit={updateRoleAclMutation(acl?.rules ?? [], acl?.sharedConfig ?? emptySharedConfig)}
        principalType={PrincipalTypeRedpandaRole}
        renderPrincipal={(props) => <LockedPrincipalField {...props} label="Role name" />}
        rules={rulesWithAllOperations.length > 0 ? rulesWithAllOperations : undefined}
        sharedConfig={acl?.sharedConfig ?? emptySharedConfig}
      />
    </div>
  );
};

export default RoleUpdatePage;
