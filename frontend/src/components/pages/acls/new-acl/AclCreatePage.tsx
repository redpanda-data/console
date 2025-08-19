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

import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useToast } from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  convertRulesToCreateACLRequests,
  PrincipalTypeUser,
  type Rule,
} from '@/components/pages/acls/new-acl/ACL.model';
import CreateACL from '@/components/pages/acls/new-acl/CreateACL';
import { ACLService } from '@/protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL } from '@/protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { uiState } from '../../../../state/uiState';
import PageContent from '../../../misc/PageContent';

const AclCreatePage = () => {
  const toast = useToast();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: '', linkTo: '' },
    ];
  }, []);

  const { mutateAsync: createACLMutation } = useMutation(createACL);

  const createAclMutation = async (principal: string, host: string, rules: Rule[]) => {
    const result = convertRulesToCreateACLRequests(rules, principal, host);

    const results = await Promise.all(
      result.map((r) => {
        return createACLMutation(r);
      }),
    );

    // TODO: handle partial failures
    console.log(results);
    toast({
      status: 'success',
      description: 'ACLs created successfully',
    });

    // Invalidate the listACLs query cache to force fresh data on next request
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: ACLService,
        cardinality: 'finite',
      }),
    });

    nav(`/security/acls/${principal.split(':')[1]}/details`);
  };

  return (
    <PageContent>
      <CreateACL
        onSubmit={createAclMutation}
        edit={false}
        principalType={PrincipalTypeUser}
        onCancel={() => nav('/security/acls')}
      />
    </PageContent>
  );
};

export default AclCreatePage;
