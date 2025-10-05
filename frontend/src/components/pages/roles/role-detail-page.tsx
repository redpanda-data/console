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
import { MatchingUsersCard } from './MatchingUsersCard';
import { Card, CardContent, CardHeader } from '../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Button } from '../../redpanda-ui/components/button';
import { type AclDetail, handleUrlWithHost } from '../acls/new-acl/ACL.model';

interface SecurityAclRulesTableProps {
  data: AclDetail[];
  roleName: string;
}

const SecurityAclRulesTable = ({ data, roleName }: SecurityAclRulesTableProps) => {
  const navigate = useNavigate();

  return (
    <Card size="full">
      <CardHeader>
        <h2 className="text-lg font-medium">Security ACL rules</h2>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Principal</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Count ACLs</TableHead>
              <TableHead>{''}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((aclData) => (
              <TableRow key={`table-item-${aclData.sharedConfig.principal}-${aclData.sharedConfig.host}`}>
                <TableCell>{aclData.sharedConfig.principal}</TableCell>
                <TableCell>{aclData.sharedConfig.host}</TableCell>
                <TableCell>{aclData.rules.length}</TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      navigate(handleUrlWithHost(`/security/roles/${roleName}/update`, aclData.sharedConfig.host));
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

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
  const { data, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`);

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">Loading role details...</div>
        </div>
      </PageContent>
    );
  }

  if (!data) {
    return (
      <PageContent>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">No Role data found.</div>
        </div>
      </PageContent>
    );
  }

  const renderACLInformation = () => {
    if (data.length === 1) {
      const aclData = data[0];
      return (
        <ACLDetails
          onUpdateACL={() => navigate(`/security/roles/${roleName}/update`)}
          rules={aclData.rules}
          sharedConfig={aclData.sharedConfig}
        />
      );
    }
    return <SecurityAclRulesTable data={data} roleName={roleName} />;
  };

  return (
    <PageContent>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 w-full">{renderACLInformation()}</div>
        <MatchingUsersCard principalType="RedpandaRole" principal={`Redpanda:${roleName}`} />
      </div>
    </PageContent>
  );
};

export default RoleDetailPage;
