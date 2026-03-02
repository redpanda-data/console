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
import { useQuery } from '@connectrpc/connect-query';

import { ListQuotasRequestSchema } from '../protogen/redpanda/api/dataplane/v1/quota_pb';
import { listQuotas } from '../protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import { MAX_PAGE_SIZE } from '../react-query/react-query.utils';

const request = create(ListQuotasRequestSchema, { pageSize: MAX_PAGE_SIZE });

export const useListQuotas = () =>
  useQuery(listQuotas, request, {
    refetchOnMount: 'always',
  });
