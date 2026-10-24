/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import type { AclDetail } from '../shared/acl-model';

type HostSelectorProps = {
  principalName: string;
  hosts: AclDetail[];
  baseUrl: string;
};

export const HostSelector = ({ principalName, hosts, baseUrl }: HostSelectorProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex w-2/3 items-center">
      <Card size={'full'}>
        <CardHeader>
          <CardTitle>Multiple hosts found</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 text-body text-subtle" data-testid="host-selector-description">
            This{' '}
            <span className="text-body font-bold" data-testid="host-selector-principal-name">
              {principalName}
            </span>{' '}
            principal has ACLs configured for multiple hosts. Select a host to view its ACL configuration.
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Principal</TableHead>
                <TableHead>Host</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosts.map(({ sharedConfig: { host: hostValue } }) => (
                <TableRow
                  className="cursor-pointer"
                  key={hostValue}
                  onClick={() => {
                    navigate({ to: baseUrl, search: { host: hostValue } }).catch((error: unknown) => {
                      toast.error('Failed to navigate', { description: String(error) });
                    });
                  }}
                  testId={`host-selector-row-${hostValue}`}
                >
                  <TableCell testId={`host-selector-principal-${hostValue}`} weight="medium">
                    {principalName}
                  </TableCell>
                  <TableCell testId={`host-selector-host-${hostValue}`} weight="medium">
                    {hostValue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
