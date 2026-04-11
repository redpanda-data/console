/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/security/acls/create');

import CreateACL from './create-acl';
import { useCreateAcls } from '../../../../react-query/api/acl';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { convertRulesToCreateACLRequests, handleResponses, type Rule } from '../shared/acl-model';
import { parsePrincipalFromParam, resolveAclSearchParams } from '../shared/principal-utils';

const AclCreatePage = () => {
  const navigate = useNavigate({ from: '/security/acls/create' });
  const search = routeApi.useSearch();

  const { sharedConfig, principalType } = resolveAclSearchParams(search);

  useSecurityBreadcrumbs([{ title: 'ACLs', linkTo: '/security/acls' }]);

  const { createAcls } = useCreateAcls();

  const createAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    const result = convertRulesToCreateACLRequests(rules, principal, host);
    const applyResult = await createAcls(result);
    handleResponses(applyResult.errors, applyResult.created);

    const { principalType: parsedType, principalName } = parsePrincipalFromParam(principal);
    const aclName = parsedType === 'User' ? principalName : principal;
    navigate({
      to: '/security/acls/$aclName/details',
      params: { aclName },
      search: { host: undefined },
    });
  };

  return (
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">Create ACL</h2>
      <CreateACL
        edit={false}
        onCancel={() => navigate({ to: '/security/acls' })}
        onSubmit={createAclMutation}
        principalType={principalType}
        sharedConfig={sharedConfig}
      />
    </div>
  );
};

export default AclCreatePage;
