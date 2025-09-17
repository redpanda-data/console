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
  PrincipalTypeUser,
  parsePrincipal,
  type Rule,
} from 'components/pages/acls/new-acl/ACL.model';
import CreateACL from 'components/pages/acls/new-acl/CreateACL';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { useCreateAcls } from '../../../../react-query/api/acl';
import PageContent from '../../../misc/PageContent';

const AclCreatePage = () => {
  const toast = useToast();
  const navigate = useNavigate();

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
        onSubmit={createAclMutation}
        edit={false}
        principalType={PrincipalTypeUser}
        onCancel={() => navigate('/security/acls')}
      />
    </PageContent>
  );
};

export default AclCreatePage;
