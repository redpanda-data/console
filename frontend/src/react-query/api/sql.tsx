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
import { useMutation, useQuery } from '@connectrpc/connect-query';
import {
  type DescribeTableRequest,
  DescribeTableRequestSchema,
  type ListCatalogsRequest,
  ListCatalogsRequestSchema,
  type ListTablesRequest,
  ListTablesRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import {
  describeTable,
  executeQuery,
  listCatalogs,
  listTables,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql-SQLService_connectquery';
import { MAX_PAGE_SIZE, type MessageInit } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type SqlQueryOptions = {
  enabled?: boolean;
};

export const useListCatalogsQuery = (input?: MessageInit<ListCatalogsRequest>, options?: SqlQueryOptions) => {
  const request = create(ListCatalogsRequestSchema, {
    pageSize: input?.pageSize ?? MAX_PAGE_SIZE,
    pageToken: input?.pageToken ?? '',
  });

  return useQuery(listCatalogs, request, {
    enabled: options?.enabled !== false,
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

export const useExecuteQueryMutation = () =>
  useMutation(executeQuery, {
    onError: (error) => toast.error(formatToastErrorMessageGRPC({ error, action: 'execute', entity: 'SQL query' })),
  });
