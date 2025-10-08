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

import { Eye, EyeOff, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { type AclDetail, getRuleDataTestId, handleUrlWithHost, parsePrincipal } from '../acls/new-acl/ACL.model';
import { OperationsBadges } from '../acls/new-acl/OperationsBadges';

interface UserAclsCardProps {
  acls?: AclDetail[];
}

interface AclTableRowProps {
  acl: AclDetail;
  isExpanded: boolean;
  onToggle: () => void;
}

const AclTableRow = ({ acl, isExpanded, onToggle }: AclTableRowProps) => {
  const rowKey = `${acl.sharedConfig.principal}-${acl.sharedConfig.host}`;
  const navigate = useNavigate();

  return [
    <TableRow className="hover:bg-gray-50" key={`acl-${rowKey}`}>
      <TableCell testId={`acl-principal-${rowKey}`}>{acl.sharedConfig.principal}</TableCell>
      <TableCell testId={`acl-host-${acl.sharedConfig.host}`}>{acl.sharedConfig.host}</TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onToggle} size="sm" testId={`view-acl-${rowKey}`} variant="outline">
            {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              navigate(
                handleUrlWithHost(
                  `/security/acls/${parsePrincipal(acl.sharedConfig.principal).name}/details`,
                  acl.sharedConfig.host
                )
              );
            }}
            size="sm"
            testId={`view-acl-${rowKey}`}
            variant="outline"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>,
    isExpanded && (
      <TableRow key={`acl-${rowKey}-expanded`}>
        <TableCell className="bg-gray-50 p-6" colSpan={3}>
          <div className="space-y-4">
            <div className="font-semibold text-gray-700 text-sm">ACL Rules ({acl.rules.length})</div>
            {acl.rules.map((rule) => (
              <div
                className="rounded-lg border border-gray-200 bg-white p-4"
                data-testid={`rule-${getRuleDataTestId(rule)}`}
                key={rule.id}
              >
                <OperationsBadges rule={rule} />
              </div>
            ))}
          </div>
        </TableCell>
      </TableRow>
    ),
  ];
};

export const UserAclsCard = ({ acls }: UserAclsCardProps) => {
  const navigate = useNavigate();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!acls || acls.length === 0) {
    return (
      <Card size="full">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>ACLs (0)</CardTitle>
          <CardAction>
            <Button
              onClick={() => {
                navigate('/security/acls/create');
              }}
              testId="create-acl-button"
              variant="outline"
            >
              Create ACL
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>No ACLs assigned to this user.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>ACLs ({acls.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Hosts</TableHead>
              <TableHead align="right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {acls.flatMap((acl) => {
              const rowKey = `${acl.sharedConfig.principal}-${acl.sharedConfig.host}`;
              const isExpanded = expandedRows.has(rowKey);

              return (
                <AclTableRow
                  acl={acl}
                  isExpanded={isExpanded}
                  key={`acl-${rowKey}`}
                  onToggle={() => toggleRow(rowKey)}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
