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

import {
  ListServerlessEgressGatewaysRequestSchema,
  type ServerlessEgressGateway,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/serverless_egress_gateway_pb';
import { listServerlessEgressGateways } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/serverless_egress_gateway-ServerlessEgressGatewayService_connectquery';
import { create } from '@bufbuild/protobuf';
import { config, isEmbedded } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

/** The API's largest page. */
const PAGE_SIZE = 100;

/**
 * Lists the egress gateways pipelines on this Serverless cluster can use: those in its resource group
 * and serverless region. Uses the controlplane API, so it only runs embedded in Cloud UI.
 *
 * `gateways` stays undefined until every page has loaded, so a gateway on a later page is never
 * mistaken for a missing one.
 */
export const useControlplaneListServerlessEgressGatewaysQuery = (opts?: { enabled?: boolean }) => {
  const transport = useControlplaneTransport();
  const { clusterId } = config;
  const hasValidClusterId = Boolean(clusterId) && clusterId !== 'default';

  const request = create(ListServerlessEgressGatewaysRequestSchema, {
    filter: { serverlessClusterId: clusterId ?? '' },
    pageSize: PAGE_SIZE,
    pageToken: '',
  });

  const result = useInfiniteQueryWithAllPages(listServerlessEgressGateways, request, {
    pageParamKey: 'pageToken',
    enabled: isEmbedded() && hasValidClusterId && (opts?.enabled ?? true),
    transport,
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
  });

  const gateways: ServerlessEgressGateway[] | undefined = result.isLoading
    ? undefined
    : result.data?.pages.flatMap((page) => page.serverlessEgressGateways);

  return { gateways, isLoading: result.isLoading, error: result.error };
};
