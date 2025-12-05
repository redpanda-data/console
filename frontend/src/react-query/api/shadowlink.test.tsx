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
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { UnifiedShadowLinkState } from 'components/pages/shadowlinks/model';
import { GetShadowLinkResponseSchema, ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink_pb';
import { getShadowLink } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink-ShadowLinkService_connectquery';
import { ShadowLinkConfigurationsSchema, ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { connectQueryWrapper } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock config module
vi.mock('config', () => ({
  isEmbedded: vi.fn(),
}));

// Mock the controlplane query hook
vi.mock('./controlplane/shadowlink', () => ({
  useControlplaneGetShadowLinkByNameQuery: vi.fn(),
  useControlplaneUpdateShadowLinkMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

// Mock the controlplane mapper for fallback scenario
vi.mock('components/pages/shadowlinks/mappers/controlplane', () => ({
  fromControlplaneShadowLink: vi.fn(),
  buildDefaultFormValuesFromControlplane: vi.fn(),
}));

import { fromControlplaneShadowLink } from 'components/pages/shadowlinks/mappers/controlplane';
// Import after mocks are set up
import { isEmbedded } from 'config';

import { useControlplaneGetShadowLinkByNameQuery } from './controlplane/shadowlink';
import { useGetShadowLinkUnified } from './shadowlink';

const mockIsEmbedded = vi.mocked(isEmbedded);
const mockUseControlplaneGetShadowLinkByNameQuery = vi.mocked(useControlplaneGetShadowLinkByNameQuery);
const mockFromControlplaneShadowLink = vi.mocked(fromControlplaneShadowLink);

// Test data factories
const createMockDataplaneShadowLink = () =>
  create(ShadowLinkSchema, {
    name: 'test-shadow-link',
    uid: 'test-uid-123',
    state: ShadowLinkState.ACTIVE,
    configurations: create(ShadowLinkConfigurationsSchema, {
      clientOptions: {
        bootstrapServers: ['localhost:9092'],
      },
    }),
  });

const createMockControlplaneResponse = () => ({
  id: 'cp-id-456',
  name: 'test-shadow-link',
  state: 5, // ACTIVE in controlplane
  resourceGroupId: 'rg-123',
  shadowRedpandaId: 'sr-456',
  createdAt: timestampFromDate(new Date('2025-01-01T00:00:00Z')),
  updatedAt: timestampFromDate(new Date('2025-01-02T00:00:00Z')),
});

describe('useGetShadowLinkUnified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns dataplane data in non-embedded mode', async () => {
    // Setup: non-embedded mode
    mockIsEmbedded.mockReturnValue(false);

    const mockShadowLink = createMockDataplaneShadowLink();
    const mockGetShadowLink = vi.fn();

    // Mock controlplane to return nothing (not enabled)
    mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // Create transport that returns dataplane data
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, (request) => {
        mockGetShadowLink(request);
        return create(GetShadowLinkResponseSchema, {
          shadowLink: mockShadowLink,
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useGetShadowLinkUnified({ name: 'test-shadow-link' }), { wrapper });

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify dataplane query was called
    expect(mockGetShadowLink).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-shadow-link' }));

    // Verify controlplane query called with enabled: false
    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: false }
    );

    // Verify data comes from dataplane
    expect(result.current.data?.name).toBe('test-shadow-link');
    expect(result.current.data?.id).toBe('test-uid-123');
    expect(result.current.data?.state).toBe(UnifiedShadowLinkState.ACTIVE);
    expect(result.current.error).toBeNull();

    // Verify controlplane fields are NOT set
    expect(result.current.data?.resourceGroupId).toBeUndefined();
    expect(result.current.data?.shadowRedpandaId).toBeUndefined();
  });

  test('returns merged data with controlplane state in embedded mode', async () => {
    // Setup: embedded mode
    mockIsEmbedded.mockReturnValue(true);

    const mockShadowLink = createMockDataplaneShadowLink();
    const mockControlplaneData = createMockControlplaneResponse();
    const mockGetShadowLink = vi.fn();

    // Mock controlplane to return data
    mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
      data: mockControlplaneData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // Create transport that returns dataplane data
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, (request) => {
        mockGetShadowLink(request);
        return create(GetShadowLinkResponseSchema, {
          shadowLink: mockShadowLink,
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useGetShadowLinkUnified({ name: 'test-shadow-link' }), { wrapper });

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify dataplane query was called
    expect(mockGetShadowLink).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-shadow-link' }));

    // Verify controlplane query called with enabled: true
    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: true }
    );

    // Verify basic data from dataplane
    expect(result.current.data?.name).toBe('test-shadow-link');

    // Verify controlplane overrides are applied
    expect(result.current.data?.resourceGroupId).toBe('rg-123');
    expect(result.current.data?.shadowRedpandaId).toBe('sr-456');
    expect(result.current.data?.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
    expect(result.current.data?.updatedAt).toEqual(new Date('2025-01-02T00:00:00Z'));

    // Verify state is from controlplane mapping
    expect(result.current.data?.state).toBe(UnifiedShadowLinkState.ACTIVE);
    expect(result.current.error).toBeNull();
  });

  test('returns controlplane data as fallback when dataplane fails in embedded mode', async () => {
    // Setup: embedded mode with dataplane failure
    mockIsEmbedded.mockReturnValue(true);

    const mockControlplaneData = createMockControlplaneResponse();
    const mockGetShadowLink = vi.fn();

    // Mock controlplane to return data
    mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
      data: mockControlplaneData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // Mock the controlplane mapper to return partial data
    const partialUnifiedData = {
      name: 'test-shadow-link',
      id: 'cp-id-456',
      state: UnifiedShadowLinkState.ACTIVE,
      tasksStatus: [],
      syncedShadowTopicProperties: [],
      resourceGroupId: 'rg-123',
      shadowRedpandaId: 'sr-456',
    };
    mockFromControlplaneShadowLink.mockReturnValue(partialUnifiedData);

    // Create transport that throws error (dataplane failure)
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, (request) => {
        mockGetShadowLink(request);
        throw new Error('Dataplane unavailable');
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useGetShadowLinkUnified({ name: 'test-shadow-link' }), { wrapper });

    // Wait for data to load (dataplane will fail after retry, but controlplane succeeds)
    // Increased timeout to account for retry: 1 in embedded mode
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 }
    );

    // Verify dataplane query was called (and failed)
    expect(mockGetShadowLink).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-shadow-link' }));

    // Verify dataplane error is captured
    expect(result.current.dataplaneError).not.toBeNull();

    // Verify controlplane query called with enabled: true
    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: true }
    );

    // Verify fromControlplaneShadowLink was called as fallback
    expect(mockFromControlplaneShadowLink).toHaveBeenCalledWith(mockControlplaneData);

    // Verify partial data from controlplane fallback
    expect(result.current.data?.name).toBe('test-shadow-link');
    expect(result.current.data?.id).toBe('cp-id-456');
    expect(result.current.data?.resourceGroupId).toBe('rg-123');
    expect(result.current.data?.shadowRedpandaId).toBe('sr-456');

    // No combined error since we have data from controlplane fallback
    expect(result.current.error).toBeNull();
  });
});
