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

import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Pencil } from 'lucide-react';
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

// Table to display multiple ACL rules for a role
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
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate(handleUrlWithHost(`/security/roles/${roleName}/details`, aclData.sharedConfig.host));
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate(handleUrlWithHost(`/security/roles/${roleName}/update`, aclData.sharedConfig.host));
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
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
  const [searchParams] = useSearchParams();
  const host = searchParams.get('host') ?? undefined;

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: roleName, linkTo: `/security/roles/${roleName}/details` },
      { title: 'Role Configuration Details', linkTo: '' },
    ];
  }, [roleName]);

  // Fetch ACLs for the role
  const { data, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`, host);

  const renderACLInformation = useMemo(() => {
    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">No Role data found.</div>
        </div>
      );
    }

    if (data.length === 1) {
      const acl = data[0];
      return (
        <ACLDetails
          sharedConfig={acl.sharedConfig}
          rules={acl.rules}
          onUpdateACL={() => navigate(handleUrlWithHost(`/security/roles/${roleName}/update`, host))}
        />
      );
    }
    return <SecurityAclRulesTable data={data} roleName={roleName} />;
  }, [data, roleName, navigate, host]);

  if (isLoading) {
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="col-span-2 w-full">{renderACLInformation}</div>
        <MatchingUsersCard principalType="RedpandaRole" principal={`Redpanda:${roleName}`} />
      </div>
    </PageContent>
  );
};

export default RoleDetailPage;
