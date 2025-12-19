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

import {
  ListShadowLinksResponseSchema,
  ShadowLinkListItemSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { listShadowLinks } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { connectQueryWrapper } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock config module
vi.mock('config', () => ({
  isEmbedded: vi.fn(),
  config: {
    clusterId: 'default',
    jwt: undefined,
  },
}));

// Mock controlplane transport hook
vi.mock('hooks/use-controlplane-transport', () => ({
  useControlplaneTransport: vi.fn(),
}));

import { config, isEmbedded } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';

import { useControlplaneListShadowLinksQuery } from './shadowlink';

const mockIsEmbedded = vi.mocked(isEmbedded);
const mockConfig = vi.mocked(config);
const mockUseControlplaneTransport = vi.mocked(useControlplaneTransport);

describe('useControlplaneListShadowLinksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testCases = [
    {
      name: 'Standalone mode (clusterId=default, isEmbedded=false)',
      clusterId: 'default',
      isEmbedded: false,
      optsEnabled: undefined,
      shouldMakeRequest: false,
    },
    {
      name: 'Embedded after setup (real clusterId, isEmbedded=true)',
      clusterId: 'cluster-abc-123',
      isEmbedded: true,
      optsEnabled: undefined,
      shouldMakeRequest: true,
    },
    {
      name: 'Embedded with opts.enabled=false',
      clusterId: 'cluster-abc-123',
      isEmbedded: true,
      optsEnabled: false,
      shouldMakeRequest: false,
    },
  ];

  test.each(testCases)('$name → shouldMakeRequest=$shouldMakeRequest', async (testCase) => {
    // Setup mocks
    mockIsEmbedded.mockReturnValue(testCase.isEmbedded);
    mockConfig.clusterId = testCase.clusterId;

    const mockListShadowLinks = vi.fn();
    const mockShadowLinks = [
      create(ShadowLinkListItemSchema, {
        id: 'sl-1',
        name: 'shadow-link-1',
        shadowRedpandaId: testCase.clusterId,
      }),
    ];

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listShadowLinks, (request) => {
        mockListShadowLinks(request);
        return create(ListShadowLinksResponseSchema, {
          shadowLinks: mockShadowLinks,
        });
      });
    });

    mockUseControlplaneTransport.mockReturnValue(transport);

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const opts = testCase.optsEnabled !== undefined ? { enabled: testCase.optsEnabled } : undefined;
    const { result } = renderHook(() => useControlplaneListShadowLinksQuery(opts), { wrapper });

    if (testCase.shouldMakeRequest) {
      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify request was made with correct filter
      expect(mockListShadowLinks).toHaveBeenCalledTimes(1);
      expect(mockListShadowLinks).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            shadowRedpandaId: testCase.clusterId,
          }),
        })
      );
      expect(result.current.data?.shadowLinks).toHaveLength(1);
    } else {
      // Wait a tick to ensure query would have been made if enabled
      await waitFor(() => {
        expect(result.current.fetchStatus).toBe('idle');
      });

      // Verify request was NOT made
      expect(mockListShadowLinks).not.toHaveBeenCalled();
      expect(result.current.data).toBeUndefined();
    }
  });
});
