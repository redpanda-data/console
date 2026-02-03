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

import { createConnectQueryKey } from '@connectrpc/connect-query';
import { useQuery } from '@tanstack/react-query';
import { config } from 'config';

import { listQuotas } from '../protogen/redpanda/api/dataplane/v1/quota-QuotaService_connectquery';
import type { QuotaResponse } from '../state/rest-interfaces';

/**
 * Custom hook to fetch quotas from REST API until protobuf endpoint is available
 */
export const useQuotasQuery = () => {
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
