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
import { type ConnectError, type ConnectRouter, createRouterTransport, type Transport } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { onTestFinished } from '@rstest/core';
import type { QueryClient } from '@tanstack/react-query';
import { config } from 'config';
import {
  type ClusterFenceState,
  type GetClusterFenceStatusResponse,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import type { ReactElement } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

export function enableFenceFixtures() {
  const previousConfig = { jwt: config.jwt, isServerless: config.isServerless, featureFlags: config.featureFlags };
  const previousFeatures = useSupportedFeaturesStore.getState();
  const previousFence = useClusterFenceStore.getState();
  config.jwt = 'test-token';
  config.isServerless = false;
  config.featureFlags = { ...config.featureFlags, enableClusterFencing: true };
  useSupportedFeaturesStore.setState({ clusterFence: true });
  useClusterFenceStore.setState({ phase: null, topology: null });
  onTestFinished(() => {
    Object.assign(config, previousConfig);
    useSupportedFeaturesStore.setState(previousFeatures, true);
    useClusterFenceStore.setState(previousFence, true);
  });
}

export function fenceStatus(state: ClusterFenceState, revision = 4n, exemptPrincipals = ['shadow-orders']) {
  return create(GetClusterFenceStatusResponseSchema, {
    fence: { state, revision, settings: { readPolicy: { exemptPrincipals } } },
  });
}

export function serveFenceStatus(
  initial: GetClusterFenceStatusResponse | ConnectError,
  register?: (router: ConnectRouter) => void
) {
  let status = initial;
  const transport = createRouterTransport((router) => {
    router.rpc(getClusterFenceStatus, () => {
      if (status instanceof Error) {
        throw status;
      }
      return status;
    });
    register?.(router);
  });
  return {
    transport,
    publish: (next: typeof initial) => {
      status = next;
    },
  };
}

export const readFenceStatus = (queryClient: QueryClient, transport: Transport) =>
  queryClient.fetchQuery(createQueryOptions(getClusterFenceStatus, {}, { transport }));

/** Open a fence dialog after the initial status read, as the page does. */
export async function renderWithFenceStatus(ui: ReactElement, transport: Transport, initialLocation = '/topics') {
  const rendered = renderWithFileRoutes(null, { initialLocation, transport });
  const { queryClient } = rendered.router.options.context;
  await readFenceStatus(queryClient, transport);
  rendered.rerender(ui);
  return { ...rendered, queryClient };
}
