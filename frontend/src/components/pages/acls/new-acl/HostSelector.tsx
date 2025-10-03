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

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { Text } from '../../../redpanda-ui/components/typography';
import type { AclDetail } from './ACL.model';

interface HostSelectorProps {
  principalName: string;
  hosts: AclDetail[];
  baseUrl: string;
}

export const HostSelector = ({ principalName, hosts, baseUrl }: HostSelectorProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <div className="flex items-center w-2/3">
      <Card size={'full'}>
        <CardHeader>
          <CardTitle>Multiple Hosts Found</CardTitle>
        </CardHeader>
        <CardContent className={' flex flex-col gap-2'}>
          <Text className="mb-4 text-gray-600" data-testid="host-selector-description">
            This{' '}
            <Text as="span" className={'font-bold'} data-testid="host-selector-principal-name">
              {principalName}
            </Text>{' '}
            principal has ACLs configured for multiple hosts. Please select a host to view its ACL configuration:
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
                  key={hostValue}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    const newSearchParams = new URLSearchParams(searchParams);
                    newSearchParams.set('host', hostValue);
                    navigate(`${baseUrl}?${newSearchParams.toString()}`);
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
