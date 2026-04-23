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

import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'components/icons';

import { Button } from '../../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../redpanda-ui/components/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import {
  type AclDetail,
  getResourceNameValue,
  type OperationType,
  OperationTypeNotSet,
  type ResourceType,
} from '../shared/acl-model';

type FlatAclRow = {
  resourceType: ResourceType;
  resourceName: string;
  operation: string;
  permission: OperationType;
  host: string;
  principal: string;
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  cluster: 'Cluster',
  topic: 'Topic',
  consumerGroup: 'Consumer Group',
  transactionalId: 'Transactional ID',
  subject: 'Subject',
  schemaRegistry: 'Schema Registry',
};

const flattenAcls = (acls: AclDetail[]): FlatAclRow[] =>
  acls.flatMap((detail) =>
    detail.rules.flatMap((rule) =>
      Object.entries(rule.operations)
        .filter(([, perm]) => perm !== OperationTypeNotSet)
        .map(([op, perm]) => ({
          resourceType: rule.resourceType,
          resourceName: getResourceNameValue(rule),
          operation: op.charAt(0) + op.slice(1).toLowerCase(),
          permission: perm,
          host: detail.sharedConfig.host,
          principal: detail.sharedConfig.principal,
        }))
    )
  );

type UserAclsCardProps = {
  acls?: AclDetail[];
  userName?: string;
};

export const UserAclsCard = ({ acls, userName }: UserAclsCardProps) => {
  const navigate = useNavigate();
  const rows = flattenAcls(acls ?? []);
  const count = rows.length;

  const navigateToEdit = () => {
    const name = userName ?? (acls?.[0] ? acls[0].sharedConfig.principal.replace(/^User:/, '') : '');
    navigate({ to: `/security/acls/${name}/details` });
  };

  const navigateToCreate = () => {
    navigate({ to: '/security/acls/create', search: { principalType: undefined, principalName: undefined } });
  };

  return (
    <Card size="full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{count === 0 ? 'ACLs (0)' : `ACLs ${count} ${count === 1 ? 'rule' : 'rules'}`}</CardTitle>
        <CardAction>
          <Button onClick={navigateToCreate} testId="create-acl-button" variant="outline">
            + Add ACL
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p>No ACLs assigned to this user.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource Type</TableHead>
                <TableHead>Resource Name</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Host</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable unique key
                <TableRow key={i}>
                  <TableCell>{RESOURCE_TYPE_LABELS[row.resourceType] ?? row.resourceType}</TableCell>
                  <TableCell className="font-mono">{row.resourceName}</TableCell>
                  <TableCell>{row.operation}</TableCell>
                  <TableCell>
                    <span className={row.permission === 'allow' ? 'text-green-600' : 'text-red-600'}>
                      {row.permission === 'allow' ? 'Allow' : 'Deny'}
                    </span>
                  </TableCell>
                  <TableCell>{row.host}</TableCell>
                  <TableCell align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost">
                          <MoreHorizontalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={navigateToEdit}>Edit</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
