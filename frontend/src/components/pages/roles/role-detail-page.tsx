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

import { Eye, Pencil } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/ui-state';

import { MatchingUsersCard } from './matching-users-card';
import { useGetAclsByPrincipal } from '../../../react-query/api/acl';
import PageContent from '../../misc/page-content';
import { Button } from '../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader } from '../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Text } from '../../redpanda-ui/components/typography';
import { type AclDetail, handleUrlWithHost } from '../acls/new-acl/acl.model';
import { ACLDetails } from '../acls/new-acl/acl-details';

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
        <h2 className="font-medium text-lg">Security ACL rules</h2>
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
              <TableRow
                data-testid={`role-acl-table-row-${aclData.sharedConfig.host}`}
                key={`table-item-${aclData.sharedConfig.principal}-${aclData.sharedConfig.host}`}
              >
                <TableCell testId={`role-acl-principal-${aclData.sharedConfig.host}`}>
                  {aclData.sharedConfig.principal}
                </TableCell>
                <TableCell testId={`role-acl-host-${aclData.sharedConfig.host}`}>{aclData.sharedConfig.host}</TableCell>
                <TableCell testId={`role-acl-count-${aclData.sharedConfig.host}`}>{aclData.rules.length}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => {
                        navigate(handleUrlWithHost(`/security/roles/${roleName}/details`, aclData.sharedConfig.host));
                      }}
                      size="sm"
                      testId={`view-role-acl-${aclData.sharedConfig.host}`}
                      variant="outline"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        navigate(handleUrlWithHost(`/security/roles/${roleName}/update`, aclData.sharedConfig.host));
                      }}
                      size="sm"
                      testId={`edit-role-acl-${aclData.sharedConfig.host}`}
                      variant="outline"
                    >
                      <Pencil className="h-4 w-4" />
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
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-500">No Role data found.</div>
        </div>
      );
    }

    if (data.length === 1) {
      const acl = data[0];
      return <ACLDetails rules={acl.rules} sharedConfig={acl.sharedConfig} />;
    }
    return <SecurityAclRulesTable data={data} roleName={roleName} />;
  }, [data, roleName]);

  if (isLoading) {
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
      <div className="flex items-center justify-between">
        <Text>
          Viewing role <Text as="span">{roleName}</Text>{' '}
        </Text>
        {(!!host || data?.length === 1) && (
          <div>
            <Button
              data-testid="update-acl-button"
              onClick={() => navigate(handleUrlWithHost(`/security/roles/${roleName}/update`, host))}
              variant="secondary"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit ACL
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="col-span-2 w-full">{renderACLInformation}</div>
        <MatchingUsersCard principal={`Redpanda:${roleName}`} principalType="RedpandaRole" />
      </div>
    </PageContent>
  );
};

export default RoleDetailPage;
