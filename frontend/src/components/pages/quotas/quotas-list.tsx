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

import { useQuery } from '@connectrpc/connect-query';
import { Alert, AlertIcon, Button, DataTable, Result, Skeleton } from '@redpanda-data/ui';
import { SkipIcon } from 'components/icons';
import { useMemo } from 'react';

import { Quota_ValueType } from '../../../protogen/redpanda/api/dataplane/v1/quota_pb';
import { listQuotas } from '../../../protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import { InfoText } from '../../../utils/tsx-utils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

const QuotasList = () => {
  const { data, error, isLoading } = useQuery(listQuotas, {});

  const quotasData = useMemo(() => {
    if (!data?.quotas) return [];

    return data.quotas.map((entry) => {
      const entityType = entry.entity?.entityType;
      const entityName = entry.entity?.entityName;

      // Map entity type to display string
      let displayType: 'client-id' | 'user' | 'ip' | 'unknown' = 'unknown';
      if (entityType === 1) displayType = 'client-id';
      else if (entityType === 3) displayType = 'user';
      else if (entityType === 4) displayType = 'ip';

      return {
        eqKey: `${entityType}-${entityName}`,
        entityType: displayType,
        entityName: entityName || undefined,
        values: entry.values,
      };
    });
  }, [data]);

  const formatBytes = (values: Quota_Value[], valueType: Quota_ValueType) => {
    const value = values.find((v) => v.valueType === valueType)?.value;
    return value ? (
      prettyBytes(value)
    ) : (
      <span style={{ opacity: 0.3 }}>
        <SkipIcon />
      </span>
    );
  };

  const formatRate = (values: (typeof quotasData)[0]['values'], valueType: Quota_ValueType) => {
    const value = values.find((v) => v.valueType === valueType)?.value;
    return value ? (
      prettyNumber(value)
    ) : (
      <span style={{ opacity: 0.3 }}>
        <SkipIcon />
      </span>
    );
  };

  if (isLoading) {
    return (
      <PageContent>
        <Section>
          <Skeleton height="400px" />
        </Section>
      </PageContent>
    );
  }

  if (error) {
    const isPermissionError = error.message.includes('permission') || error.message.includes('forbidden');

    if (isPermissionError) {
      return (
        <PageContent>
          <Section>
            <Result
              extra={
                <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
                  <Button variant="solid">Redpanda Console documentation for roles and permissions</Button>
                </a>
              }
              status={403}
              title="Forbidden"
              userMessage={
                <p>
                  You are not allowed to view this page.
                  <br />
                  Contact the administrator if you think this is an error.
                </p>
              }
            />
          </Section>
        </PageContent>
      );
    }

    return (
      <PageContent>
        <Section>
          <Alert status="warning" style={{ marginBottom: '1em' }} variant="solid">
            <AlertIcon />
            {error.message || 'Failed to load quotas'}
          </Alert>
        </Section>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Section>
        <DataTable<{
          eqKey: string;
          entityType: 'client-id' | 'user' | 'ip' | 'unknown';
          entityName?: string | undefined;
          values: Array<{ valueType: Quota_ValueType; value: number }>;
        }>
          columns={[
            {
              size: 100,
              header: 'Type',
              accessorKey: 'entityType',
            },
            {
              size: 100,
              header: 'Name',
              accessorKey: 'entityName',
            },
            {
              size: 100,
              header: () => <InfoText tooltip="Limit throughput of produce requests">Producer Rate</InfoText>,
              accessorKey: 'producerRate',
              cell: ({ row: { original } }) => formatBytes(original.values, Quota_ValueType.PRODUCER_BYTE_RATE),
            },
            {
              size: 100,
              header: () => <InfoText tooltip="Limit throughput of fetch requests">Consumer Rate</InfoText>,
              accessorKey: 'consumerRate',
              cell: ({ row: { original } }) => formatBytes(original.values, Quota_ValueType.CONSUMER_BYTE_RATE),
            },
            {
              size: 100,
              header: () => (
                <InfoText tooltip="Limit rate of topic mutation requests, including create, add, and delete partition, in number of partitions per second">
                  Controller Mutation Rate
                </InfoText>
              ),
              accessorKey: 'controllerMutationRate',
              cell: ({ row: { original } }) => formatRate(original.values, Quota_ValueType.CONTROLLER_MUTATION_RATE),
            },
          ]}
          data={quotasData}
        />
      </Section>
    </PageContent>
  );
};

export default QuotasList;
