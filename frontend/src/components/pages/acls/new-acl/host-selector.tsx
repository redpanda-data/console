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

import type { AclDetail } from './acl.model';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Text } from '../../../redpanda-ui/components/typography';

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
        <CardContent className={'flex flex-col gap-2'}>
          <Text className="mb-4 text-gray-600" data-testid="host-selector-description">
            This{' '}
            <Text as="span" className={'font-bold'} data-testid="host-selector-principal-name">
              {principalName}
            </Text>{' '}
            principal has ACLs configured for multiple hosts. Select a host to view its ACL configuration.
          </Text>
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
                  className="cursor-pointer hover:bg-gray-50"
                  key={hostValue}
                  onClick={() => {
                    navigate({ to: baseUrl, search: { host: hostValue } });
                  }}
                  testId={`host-selector-row-${hostValue}`}
                >
                  <TableCell className="font-medium" testId={`host-selector-principal-${hostValue}`}>
                    {principalName}
                  </TableCell>
                  <TableCell className="font-medium" testId={`host-selector-host-${hostValue}`}>
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
