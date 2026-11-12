import { create } from '@bufbuild/protobuf';
import { createRouterTransport, type Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import {
  ClusterFenceState,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { type PropsWithChildren, useState } from 'react';

import { trackedQueryClients } from '../../../../../tests/harness-cleanup';

const defaultTransport = createRouterTransport(({ rpc }) => {
  rpc(getClusterFenceStatus, () =>
    create(GetClusterFenceStatusResponseSchema, { fence: { state: ClusterFenceState.UNFENCED } })
  );
});

/** Real providers for security controls, including their shared fence query. */
export function SecurityQueryProvider({
  children,
  transport = defaultTransport,
}: PropsWithChildren<{ transport?: Transport }>) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    trackedQueryClients.add(queryClient);
    return queryClient;
  });
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </TransportProvider>
  );
}
