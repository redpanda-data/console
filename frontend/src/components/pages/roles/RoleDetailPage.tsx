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

import { useMutation, useQuery } from '@connectrpc/connect-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@redpanda-data/ui';
import { type ListACLsRequest } from '@/protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '@/protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import {
  deleteRole,
  getRole,
  listRoleMembers,
} from '@/protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import {
  type DeleteRoleRequest,
  type GetRoleRequest,
  type ListRoleMembersRequest,
} from '@/protogen/redpanda/api/dataplane/v1/security_pb';
import { getAclFromAclListResponse } from '../acls/new-acl/ACL.model';
import { ACLDetails } from '../acls/new-acl/ACLDetails';
import { uiState } from '../../../state/uiState';
import PageContent from '../../misc/PageContent';

const RoleDetailPage = () => {
  const { roleName = '' } = useParams<{ roleName: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: roleName, linkTo: `/security/roles/${roleName}/details`, heading: 'Role Details' },
    ];
  }, [roleName]);

  // Fetch role details
  const { data: roleData } = useQuery(
    getRole,
    {
      roleName,
    } as GetRoleRequest,
    {
      enabled: !!roleName,
    },
  );

  // Fetch ACLs for the role
  const { data: aclData } = useQuery(
    listACLs,
    {
      filter: {
        principal: `RedpandaRole:${roleName}`,
      },
    } as ListACLsRequest,
    {
      enabled: !!roleName,
      select: getAclFromAclListResponse,
    },
  );

  // Fetch role members
  const { data: membersData } = useQuery(
    listRoleMembers,
    {
      roleName,
      pageSize: 100,
    } as ListRoleMembersRequest,
    {
      enabled: !!roleName,
    },
  );

  const { mutateAsync: deleteRoleMutation } = useMutation(deleteRole);

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the role "${roleName}" and all its associated ACLs?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteRoleMutation({
        roleName,
        deleteAcls: true,
      } as DeleteRoleRequest);

      toast({
        status: 'success',
        description: `Role "${roleName}" deleted successfully`,
      });

      navigate('/security/roles');
    } catch (error) {
      toast({
        status: 'error',
        description: `Failed to delete role: ${error}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!aclData || !roleData) {
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
