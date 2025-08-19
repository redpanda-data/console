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

import { useQuery } from '@connectrpc/connect-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type ListACLsRequest } from '@/protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '@/protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { getAclFromAclListResponse } from './ACL.model';
import { uiState } from '@/state/uiState';
import { ACLDetails } from './ACLDetails';

const AclDetailPage = () => {
  const { aclName = '' } = useParams<{ aclName: string }>();
  const navigate = useNavigate();
  const { data } = useQuery(
    listACLs,
    {
      filter: {
        principal: `User:${aclName}`,
      },
    } as ListACLsRequest,
    {
      enabled: !!aclName,
      select: getAclFromAclListResponse,
    },
  );

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: aclName, linkTo: `/security/acls/${aclName}/details` },
      { title: '', linkTo: ``, heading: '' },
    ];
  }, [aclName]);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <ACLDetails
      sharedConfig={data.sharedConfig}
      rules={data.rules}
      onUpdateACL={() => navigate(`/security/acls/${data.sharedConfig.principal.split(':')[1]}/update`)}
    />
  );
};

export default AclDetailPage;
