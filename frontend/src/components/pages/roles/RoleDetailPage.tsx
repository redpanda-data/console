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

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';

import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import PageContent from '../../misc/PageContent';
import { ACLDetails } from '../acls/new-acl/ACLDetails';

const RoleDetailPage = () => {
  const { roleName = '' } = useParams<{ roleName: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: roleName, linkTo: `/security/roles/${roleName}/details` },
      { title: 'Role Configuration Details', linkTo: '' },
    ];
  }, [roleName]);

  // Fetch ACLs for the role
  const { data: aclData } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`);

  if (!aclData) {
    return (
      <PageContent>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading role details...</div>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent>
      {aclData && (
        <ACLDetails
          sharedConfig={aclData.sharedConfig}
          rules={aclData.rules}
          onUpdateACL={() => navigate(`/security/roles/${roleName}/update`)}
          showMatchingUsers={true}
        />
      )}
    </PageContent>
  );
};

export default RoleDetailPage;
