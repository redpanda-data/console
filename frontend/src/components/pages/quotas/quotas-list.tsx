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

import { createConnectQueryKey } from '@connectrpc/connect-query';
import { Alert, AlertIcon, Button, DataTable, Result, Skeleton } from '@redpanda-data/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SkipIcon } from 'components/icons';
import { config } from 'config';
import { useMemo } from 'react';

import {
  Quota_EntityType,
  type Quota_Value,
  Quota_ValueType,
} from '../../../protogen/redpanda/api/dataplane/v1/quota_pb';
import { listQuotas } from '../../../protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import type { QuotaResponse, QuotaResponseSetting } from '../../../state/rest-interfaces';
import { InfoText } from '../../../utils/tsx-utils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

/**
 * Maps REST API quota value types to protobuf ValueType enum
 */
const mapValueTypeToProto = (key: string): Quota_ValueType => {
  switch (key) {
    case 'producer_byte_rate':
      return Quota_ValueType.PRODUCER_BYTE_RATE;
    case 'consumer_byte_rate':
      return Quota_ValueType.CONSUMER_BYTE_RATE;
    case 'controller_mutation_rate':
      return Quota_ValueType.CONTROLLER_MUTATION_RATE;
    case 'request_percentage':
      return Quota_ValueType.REQUEST_PERCENTAGE;
    default:
      return Quota_ValueType.UNSPECIFIED;
  }
};

/**
 * Maps REST API entity type to protobuf EntityType enum
 */
const mapEntityTypeToProto = (entityType: string): Quota_EntityType => {
  switch (entityType) {
    case 'client-id':
      return Quota_EntityType.CLIENT_ID;
    case 'user':
      return Quota_EntityType.USER;
    case 'ip':
      return Quota_EntityType.IP;
    default:
      return Quota_EntityType.UNSPECIFIED;
  }
};

/**
 * Custom hook to fetch quotas from REST API until protobuf endpoint is available
 */
const useQuotasQuery = () => {
  // Create a query key compatible with Connect Query for future migration
  const queryKey = createConnectQueryKey({
    schema: listQuotas,
    input: {},
    cardinality: 'finite',
  });

  return useQuery<QuotaResponse | null>({
    queryKey,
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/quotas`, {
        method: 'GET',
        headers: {},
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          throw new Error('You do not have permission to view quotas');
        }
        throw new Error(`Failed to fetch quotas: ${response.statusText}`);
      }

      const data: QuotaResponse = await response.json();
      return data;
    },
    refetchOnMount: 'always',
  });
};

const QuotasList = () => {
  const navigate = useNavigate({ from: '/quotas' });
  const search = useSearch({ from: '/quotas' });
  const { data, error, isLoading } = useQuotasQuery();

  const quotasData = useMemo(() => {
    if (!data?.items) {
      return [];
    }

    return data.items.map((item) => {
      const entityType = mapEntityTypeToProto(item.entityType);
      const entityName = item.entityName;

      // Map entity type to display string
      let displayType: 'client-id' | 'user' | 'ip' | 'unknown' = 'unknown';
      if (entityType === Quota_EntityType.CLIENT_ID) {
        displayType = 'client-id';
      } else if (entityType === Quota_EntityType.USER) {
        displayType = 'user';
      } else if (entityType === Quota_EntityType.IP) {
        displayType = 'ip';
      }

      // Transform REST API settings to protobuf Value format
      const values: Quota_Value[] = item.settings.map(
        (setting: QuotaResponseSetting): Quota_Value => ({
          valueType: mapValueTypeToProto(setting.key),
          value: setting.value,
          $typeName: 'redpanda.api.dataplane.v1.Quota.Value',
        })
      );

      return {
        eqKey: `${entityType}-${entityName}`,
        entityType: displayType,
        entityName: entityName || undefined,
        values,
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

  const formatRate = (values: Quota_Value[], valueType: Quota_ValueType) => {
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

  if (data?.error) {
    return (
      <PageContent>
        <Section>
          <Alert status="warning" style={{ marginBottom: '1em' }} variant="solid">
            <AlertIcon />
            {data.error}
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
          values: Quota_Value[];
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
          defaultPageSize={50}
          onPaginationChange={(updater) => {
            const newPagination =
              typeof updater === 'function'
                ? updater({ pageIndex: search.page ?? 0, pageSize: search.pageSize ?? 50 })
                : updater;

            navigate({
              search: (prev) => ({
                ...prev,
                page: newPagination.pageIndex,
                pageSize: newPagination.pageSize,
              }),
              replace: true,
            });
          }}
          pagination={{
            pageIndex: search.page ?? 0,
            pageSize: search.pageSize ?? 50,
          }}
        />
      </Section>
    </PageContent>
  );
};

export default QuotasList;
