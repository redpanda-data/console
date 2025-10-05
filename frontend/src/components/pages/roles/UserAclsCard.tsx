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

import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { type AclDetail, handleUrlWithHost } from '../acls/new-acl/ACL.model';

interface UserAclsCardProps {
  acls?: AclDetail[];
}

export const UserAclsCard = ({ acls }: UserAclsCardProps) => {
  const navigate = useNavigate();

  if (!acls || acls.length === 0) {
    return (
      <Card size="full">
        <CardHeader className="flex justify-between items-center">
          <CardTitle>ACLs (0)</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              onClick={() => {
                navigate('/security/acls/create');
              }}
              testId="create-acl-button"
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
      <CardHeader className="flex justify-between items-center">
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
            {acls.map((r) => {
              return (
                <TableRow key={`acl-${r.sharedConfig.principal}-${r.sharedConfig.host}`}>
                  <TableCell testId={`acl-principal-${r.sharedConfig.principal}-${r.sharedConfig.host}`}>
                    {r.sharedConfig.principal}
                  </TableCell>
                  <TableCell testId={`acl-host-${r.sharedConfig.host}`}>{r.sharedConfig.host}</TableCell>
                  <TableCell align="right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate(
                          handleUrlWithHost(`/security/acls/${r.sharedConfig.principal}/details`, r.sharedConfig.host),
                        );
                      }}
                      testId={`view-acl-${r.sharedConfig.principal}-${r.sharedConfig.host}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
