/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { ConnectError, createRouterTransport } from '@connectrpc/connect';
import { describe, expect, test } from '@rstest/core';
import { GetShadowMetricsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { getShadowMetrics } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import { render, screen, waitFor } from 'test-utils';

import { ShadowLinkMetrics } from './shadow-link-metrics';
import { type UnifiedShadowLink, UnifiedShadowLinkState } from '../model';

const mockShadowLink: UnifiedShadowLink = {
  name: 'test-link',
  id: 'test-uid',
  state: UnifiedShadowLinkState.ACTIVE,
  configurations: undefined,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
};

describe('the shadow link metrics', () => {
  test('displays loaded metrics from the RPC', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowMetrics, () =>
        create(GetShadowMetricsResponseSchema, {
          totalTopicsReplicated: 100n,
          failedOverTopics: 5n,
          errorTopics: 2n,
        })
      );
    });
    render(<ShadowLinkMetrics shadowLink={mockShadowLink} />, { transport });
    await waitFor(() => expect(screen.getByTestId('metric-value-replicated')).toHaveTextContent('100'));
    expect(screen.getByTestId('metric-value-state')).toHaveTextContent('Active');
    expect(screen.getByTestId('metric-value-failedover')).toHaveTextContent('5');
    expect(screen.getByTestId('metric-value-error')).toHaveTextContent('2');
  });

  test('displays the RPC failure state', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowMetrics, () => {
        throw new ConnectError('Failed to fetch metrics');
      });
    });
    render(<ShadowLinkMetrics shadowLink={mockShadowLink} />, { transport });
    expect(await screen.findByTestId('shadow-link-metrics-error')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load metrics:.*Failed to fetch metrics/)).toBeInTheDocument();
  });
});
