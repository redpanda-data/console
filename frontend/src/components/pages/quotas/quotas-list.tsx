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

import { create } from '@bufbuild/protobuf';
import { useQuery } from '@connectrpc/connect-query';
import { Alert, AlertIcon, Button, DataTable, Result, Skeleton } from '@redpanda-data/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SkipIcon } from 'components/icons';
import { Link } from 'components/redpanda-ui/components/typography';
import { useMemo } from 'react';

import {
  ListQuotasRequestSchema,
  Quota_EntityType,
  type Quota_Value,
  Quota_ValueType,
} from '../../../protogen/redpanda/api/dataplane/v1/quota_pb';
import { listQuotas } from '../../../protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import { MAX_PAGE_SIZE } from '../../../react-query/react-query.utils';
import { InfoText } from '../../../utils/tsx-utils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

/**
 * Maps protobuf EntityType enum to display string
 */
const mapEntityTypeToDisplay = (entityType: Quota_EntityType): 'client-id' | 'user' | 'ip' | 'unknown' => {
  switch (entityType) {
    case Quota_EntityType.CLIENT_ID:
    case Quota_EntityType.CLIENT_ID_PREFIX:
      return 'client-id';
    case Quota_EntityType.USER:
      return 'user';
    case Quota_EntityType.IP:
      return 'ip';
    default:
      return 'unknown';
  }
};

const request = create(ListQuotasRequestSchema, { pageSize: MAX_PAGE_SIZE });

const QuotasList = () => {
  const navigate = useNavigate({ from: '/quotas' });
  const search = useSearch({ from: '/quotas' });
  const { data, error, isLoading } = useQuery(listQuotas, request, {
    refetchOnMount: 'always',
  });

  const quotasData = useMemo(() => {
    if (!data?.quotas) {
      return [];
    }

    return data.quotas.map((quota) => {
      const entityType = quota.entity?.entityType ?? Quota_EntityType.UNSPECIFIED;
      const entityName = quota.entity?.entityName;

      return {
        eqKey: `${entityType}-${entityName}`,
        entityType: mapEntityTypeToDisplay(entityType),
        entityName: entityName || undefined,
        values: quota.values,
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
                <Link href="https://docs.redpanda.com/docs/manage/console/" target="_blank">
                  <Button variant="solid">Redpanda Console documentation for roles and permissions</Button>
                </Link>
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
