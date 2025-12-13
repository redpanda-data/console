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

import { useToast } from '@redpanda-data/ui';
import {
  convertRulesToCreateACLRequests,
  handleResponses,
  type PrincipalType,
  PrincipalTypeRedpandaRole,
  PrincipalTypeUser,
  parsePrincipal,
  type Rule,
} from 'components/pages/acls/new-acl/acl.model';
import CreateACL from 'components/pages/acls/new-acl/create-acl';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/ui-state';

import { useCreateAcls } from '../../../../react-query/api/acl';
import PageContent from '../../../misc/page-content';

const AclCreatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const principalTypeParam = searchParams.get('principalType')?.toLowerCase();
  const principalName = searchParams.get('principalName');

  const principalTypeMap: Record<string, PrincipalType> = {
    redpandarole: PrincipalTypeRedpandaRole,
    user: PrincipalTypeUser,
  };

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
    handleResponses(toast, applyResult.errors, applyResult.created);

    navigate(`/security/acls/${parsePrincipal(principal).name}/details`);
  };

  return (
    <PageContent>
      <CreateACL
        edit={false}
        onCancel={() => navigate('/security/acls')}
        onSubmit={createAclMutation}
        principalType={principalType}
        sharedConfig={sharedConfig}
      />
    </PageContent>
  );
};

export default AclCreatePage;
