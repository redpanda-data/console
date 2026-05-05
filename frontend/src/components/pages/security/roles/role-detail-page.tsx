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

import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Eye, Pencil } from 'lucide-react';

import { MatchingUsersCard } from './matching-users-card';
import { RoleDetailPageNew } from './role-detail-page-new';
import { isFeatureFlagEnabled } from '../../../../config';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { Button } from '../../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader } from '../../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Heading, Text } from '../../../redpanda-ui/components/typography';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { ACLDetails } from '../shared/acl-details';
import type { AclDetail } from '../shared/acl-model';

type SecurityAclRulesTableProps = {
  data: AclDetail[];
  roleName: string;
};

const SecurityAclRulesTable = ({ data, roleName }: SecurityAclRulesTableProps) => {
  const navigate = useNavigate({ from: '/security/roles/$roleName/details' });

  return (
    <Card size="full">
      <CardHeader>
        <Heading className="font-medium text-lg" level={2}>
          Security ACL rules
        </Heading>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Principal</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>ACLs count</TableHead>
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
                        navigate({
                          to: '/security/roles/$roleName/details',
                          params: { roleName },
                          search: { host: aclData.sharedConfig.host },
                        });
                      }}
                      size="sm"
                      testId={`view-role-acl-${aclData.sharedConfig.host}`}
                      variant="outline"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        navigate({
                          to: '/security/roles/$roleName/update',
                          params: { roleName },
                          search: { host: aclData.sharedConfig.host },
                        });
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
  const { roleName } = useParams({ from: '/security/roles/$roleName/details' });
  const navigate = useNavigate({ from: '/security/roles/$roleName/details' });
  const { host: hostParam } = useSearch({ from: '/security/roles/$roleName/details' });
  const host = hostParam ?? undefined;

  useSecurityBreadcrumbs([
    { title: 'Roles', linkTo: '/security/roles' },
    { title: roleName, linkTo: `/security/roles/${roleName}/details` },
  ]);

  const { data, isLoading } = useGetAclsByPrincipal(`RedpandaRole:${roleName}`, host);

  const renderACLInformation = () => {
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
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-gray-500">Loading role details...</div>
      </div>
    );
  }

  return (
    <div>
      <Heading className="pt-4 pb-3 font-semibold text-xl" level={2}>
        Role: {roleName}
      </Heading>
      <div className="flex items-center justify-between">
        <Text>Configuration details</Text>
        {(!!host || data?.length === 1) && (
          <div>
            <Button
              data-testid="update-acl-button"
              onClick={() =>
                navigate({
                  to: '/security/roles/$roleName/update',
                  params: { roleName },
                  search: { host },
                })
              }
              variant="primary"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit ACL
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="col-span-2 w-full">{renderACLInformation()}</div>
        <MatchingUsersCard principal={`Redpanda:${roleName}`} principalType="RedpandaRole" />
      </div>
    </div>
  );
};

const RoleDetailPageDispatcher = () =>
  isFeatureFlagEnabled('enableNewSecurityPage') ? <RoleDetailPageNew /> : <RoleDetailPage />;

export default RoleDetailPageDispatcher;
