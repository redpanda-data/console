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
import { uiState } from 'state/ui-state';

import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import PageContent from '../../misc/page-content';
import { ACLDetails } from '../acls/new-acl/acl-details';

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
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading role details...</div>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent>
      {aclData && (
        <ACLDetails
          onUpdateACL={() => navigate(`/security/roles/${roleName}/update`)}
          rules={aclData.rules}
          sharedConfig={aclData.sharedConfig}
          showMatchingUsers={true}
        />
      )}
    </PageContent>
  );
};

export default RoleDetailPage;
