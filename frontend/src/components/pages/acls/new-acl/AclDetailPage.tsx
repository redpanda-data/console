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

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { parsePrincipal } from './ACL.model';
import { ACLDetails } from './ACLDetails';

const AclDetailPage = () => {
  const { aclName = '' } = useParams<{ aclName: string }>();
  const navigate = useNavigate();
  const { data } = useGetAclsByPrincipal(`User:${aclName}`);

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: aclName, linkTo: `/security/acls/${aclName}/details` },
      { title: 'ACL Configuration Details', linkTo: '', heading: '' },
    ];
  }, [aclName]);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <ACLDetails
      sharedConfig={data.sharedConfig}
      rules={data.rules}
      onUpdateACL={() => navigate(`/security/acls/${parsePrincipal(data.sharedConfig.principal).name}/update`)}
      isSimpleView={false}
    />
  );
};

export default AclDetailPage;
