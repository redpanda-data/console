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

import { createRouterTransport, type Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { expect, test } from '@rstest/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import type { PropsWithChildren } from 'react';

import { useListSecretsQuery } from './secret';
import { trackedQueryClients } from '../../../tests/harness-cleanup';

function secretsTransport(id: string) {
  return createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () => ({ response: { secrets: [{ id }] } }));
  });
}

function secretsWrapper(client: QueryClient, endpoint: { transport: Transport }) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <TransportProvider transport={endpoint.transport}>{children}</TransportProvider>
      </QueryClientProvider>
    );
  };
}

test('does not reuse cached secret IDs when the transport changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } });
  trackedQueryClients.add(client);
  const endpoint = { transport: secretsTransport('first') };
  const { result, rerender } = renderHook(() => useListSecretsQuery(), {
    wrapper: secretsWrapper(client, endpoint),
  });
  const ids = () => result.current.data?.secrets.map((secret) => secret.id);
  await waitFor(() => expect(ids()).toStrictEqual(['first']));

  endpoint.transport = secretsTransport('second');
  rerender();

  await waitFor(() => expect(ids()).toStrictEqual(['second']));
});
