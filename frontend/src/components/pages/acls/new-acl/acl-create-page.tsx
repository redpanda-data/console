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

import {
  convertRulesToCreateACLRequests,
  handleResponses,
  type PrincipalType,
  PrincipalTypeGroup,
  PrincipalTypeRedpandaRole,
  PrincipalTypeUser,
  type Rule,
} from 'components/pages/acls/new-acl/acl.model';
import CreateACL from 'components/pages/acls/new-acl/create-acl';
import { parsePrincipalFromParam } from 'components/pages/acls/new-acl/principal-utils';
import { useEffect } from 'react';
import { uiState } from 'state/ui-state';

import { useCreateAcls } from '../../../../react-query/api/acl';
import PageContent from '../../../misc/page-content';

const principalTypeMap: Record<string, PrincipalType> = {
  redpandarole: PrincipalTypeRedpandaRole,
  user: PrincipalTypeUser,
  group: PrincipalTypeGroup,
};

const AclCreatePage = () => {
  const navigate = useNavigate({ from: '/security/acls/create' });
  const search = routeApi.useSearch();

  const principalTypeParam = search.principalType?.toLowerCase();
  const principalName = search.principalName;
  const principalType = principalTypeParam ? principalTypeMap[principalTypeParam] : undefined;

  const sharedConfig =
    principalName && principalType ? { principal: `${principalType}${principalName}`, host: '*' } : undefined;

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: 'Create ACL', linkTo: '' },
    ];
  }, []);

  const { createAcls } = useCreateAcls();

  const createAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    const result = convertRulesToCreateACLRequests(rules, principal, host);
    const applyResult = await createAcls(result);
    handleResponses(applyResult.errors, applyResult.created);

    const { principalType, principalName } = parsePrincipalFromParam(principal);
    const aclName = principalType === 'User' ? principalName : principal;
    navigate({
      to: '/security/acls/$aclName/details',
      params: { aclName },
      search: { host: undefined },
    });
  };

  return (
    <PageContent>
      <CreateACL
        edit={false}
        onCancel={() => navigate({ to: '/security/$tab', params: { tab: 'acls' } })}
        onSubmit={createAclMutation}
        principalType={principalType}
        sharedConfig={sharedConfig}
      />
    </PageContent>
  );
};

export default AclCreatePage;
