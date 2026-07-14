/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { GetTopicConfigurationsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { getTopicConfigurations } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import {
  type DescribeTableRequest,
  DescribeTableRequestSchema,
  GetSqlIdentityRequestSchema,
  type ListCatalogsRequest,
  ListCatalogsRequestSchema,
  type ListTablesRequest,
  ListTablesRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import {
  describeTable,
  executeQuery,
  getSqlIdentity,
  listCatalogs,
  listTables,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql-SQLService_connectquery';
import { LONG_LIVED_CACHE_STALE_TIME, MAX_PAGE_SIZE, type MessageInit } from 'react-query/react-query.utils';

type SqlQueryOptions = {
  enabled?: boolean;
};

// Catalogs, tables and identity only change through explicit actions (table
// creation invalidates via useInvalidateSqlCatalog), so a long stale time is
// safe — it stops the landing↔editor view switch from refetching all three
// on every toggle.

export const useListCatalogsQuery = (input?: MessageInit<ListCatalogsRequest>, options?: SqlQueryOptions) => {
  const request = create(ListCatalogsRequestSchema, {
    pageSize: input?.pageSize ?? MAX_PAGE_SIZE,
    pageToken: input?.pageToken ?? '',
  });

  return useQuery(listCatalogs, request, {
    enabled: options?.enabled !== false,
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
  });
};

// Resolves the caller's SQL identity (engine username + admin/superuser flag).
// Admin gates write/DDL affordances like the "Add a topic" button.
export const useGetSqlIdentityQuery = (options?: SqlQueryOptions) => {
  const request = create(GetSqlIdentityRequestSchema, {});
  return useQuery(getSqlIdentity, request, {
    enabled: options?.enabled !== false,
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
  });
};

export const useListTablesQuery = (input?: MessageInit<ListTablesRequest>, options?: SqlQueryOptions) => {
  const request = create(ListTablesRequestSchema, {
    catalog: input?.catalog ?? '',
    pageSize: input?.pageSize ?? MAX_PAGE_SIZE,
    pageToken: input?.pageToken ?? '',
    filter: input?.filter,
  });

  return useQuery(listTables, request, {
    enabled: options?.enabled !== false && Boolean(input?.catalog),
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
  });
};

export const useDescribeTableQuery = (input?: MessageInit<DescribeTableRequest>, options?: SqlQueryOptions) => {
  const request = create(DescribeTableRequestSchema, {
    catalog: input?.catalog ?? '',
    name: input?.name ?? '',
  });

  return useQuery(describeTable, request, {
    enabled: options?.enabled !== false && Boolean(input?.catalog) && Boolean(input?.name),
  });
};

// RP SQL's SHOW TABLES has no per-table Iceberg flag; the authoritative signal
// is the backing Kafka topic's `redpanda.iceberg.mode` config. Returns whether
// the topic is Iceberg-tiered so the catalog tree can show the label.
export const useTopicIcebergQuery = (topicName: string, options?: SqlQueryOptions) => {
  const request = create(GetTopicConfigurationsRequestSchema, { topicName });
  const result = useQuery(getTopicConfigurations, request, {
    enabled: options?.enabled !== false && Boolean(topicName),
  });
  const mode = result.data?.configurations.find((c) => c.name === 'redpanda.iceberg.mode')?.value;
  return { ...result, isIceberg: Boolean(mode && mode !== 'disabled') };
};

// Errors surface inline (run panel / wizard), so no toast on failure.
export const useExecuteQueryMutation = () => useMutation(executeQuery);

// Returns a function that refreshes the catalog/table listings, e.g. after a
// CREATE TABLE so the new table shows up in the tree.
export const useInvalidateSqlCatalog = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listCatalogs, cardinality: 'finite' }),
      }),
      queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTables, cardinality: 'finite' }) }),
    ]);
};
