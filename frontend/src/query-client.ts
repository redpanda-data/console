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

import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient } from '@tanstack/react-query';

import { QUERY_DEFAULTS } from './query-policy';

function isConnectError(error: Error | ConnectError): error is ConnectError {
  return error instanceof ConnectError;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...QUERY_DEFAULTS,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount > 3) {
          return false;
        }

        if (isConnectError(error)) {
          // Retry PermissionDenied errors to ensure we have some wiggle room for role propagation/RBAC
          return error.code === Code.PermissionDenied;
        }

        return false;
      },
    },
  },
});

export default queryClient;
