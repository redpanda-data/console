import { create } from '@bufbuild/protobuf';
import type { Transport } from '@connectrpc/connect';
import { ConnectError } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import type { QueryClient } from '@tanstack/react-query';
import { ListShadowLinksRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';

/** Prefetch the list, leaving expected API failures to the page's error/retry state. */
export async function loadShadowlinks({
  queryClient,
  dataplaneTransport,
}: {
  queryClient: QueryClient;
  dataplaneTransport: Transport;
}) {
  try {
    await queryClient.ensureQueryData(
      createQueryOptions(listShadowLinks, create(ListShadowLinksRequestSchema, {}), { transport: dataplaneTransport })
    );
  } catch (error) {
    if (error instanceof ConnectError) {
      return;
    }
    throw error;
  }
}
