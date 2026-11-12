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
  type DeleteShadowLinkOperation as ControlplaneDeleteOperation,
  DeleteShadowLinkOperationSchema as ControlplaneDeleteOperationSchema,
  type DeleteShadowLinkRequest as ControlplaneDeleteRequest,
  type ShadowLink as ControlplaneShadowLink,
  ShadowLinkSchema as ControlplaneShadowLinkSchema,
  ShadowLink_State as ControlplaneShadowLinkState,
  type UpdateShadowLinkOperation as ControlplaneUpdateOperation,
  UpdateShadowLinkOperationSchema as ControlplaneUpdateOperationSchema,
  type UpdateShadowLinkRequest as ControlplaneUpdateRequest,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { ConnectError } from '@connectrpc/connect';
import { createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { MutationObserver, QueryClient, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { fromControlplaneShadowLink } from 'components/pages/shadowlinks/mappers/controlplane';
import { UnifiedShadowLinkState } from 'components/pages/shadowlinks/model';
import { DeleteShadowLinkResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { deleteShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  type GetShadowLinkResponse,
  GetShadowLinkResponseSchema,
  ShadowLinkSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  failOver,
  getShadowLink,
  listShadowLinkTopics,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import { ShadowLinkConfigurationsSchema, ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { MessageInit } from 'react-query/react-query.utils';
import { connectQueryWrapper } from 'test-utils';

import {
  useControlplaneDeleteShadowLinkMutation,
  useControlplaneGetShadowLinkByNameQuery,
} from './controlplane/shadowlink';
import {
  useDeleteShadowLinkUnified,
  useEditShadowLink,
  useFailoverShadowLinkMutation,
  useGetShadowLinkUnified,
  useListShadowTopicQuery,
} from './shadowlink';
// Import after mocks are set up
import { isEmbedded } from '../../runtime-config';

// Mock config module
rs.mock('runtime-config', () => ({
  isEmbedded: rs.fn(),
}));

// Mock the controlplane query hook
rs.mock('./controlplane/shadowlink', () => ({
  useControlplaneGetShadowLinkByNameQuery: rs.fn(),
  useControlplaneUpdateShadowLinkMutation: rs.fn(() =>
    useMutation<ControlplaneUpdateOperation, ConnectError, MessageInit<ControlplaneUpdateRequest>>({
      mutationFn: () => Promise.resolve(create(ControlplaneUpdateOperationSchema)),
    })
  ),
  useControlplaneDeleteShadowLinkMutation: rs.fn(() =>
    useMutation<ControlplaneDeleteOperation, ConnectError, MessageInit<ControlplaneDeleteRequest>>({
      mutationFn: () => Promise.resolve(create(ControlplaneDeleteOperationSchema)),
    })
  ),
}));

// Mock the controlplane mapper for the fallback scenario. Form-value building
// delegates to the real mapper so useEditShadowLink tests exercise actual
// hydration (rs.clearAllMocks clears calls, not this implementation).
rs.mock('components/pages/shadowlinks/mappers/controlplane', () => {
  const actual = rs.requireActual<typeof import('components/pages/shadowlinks/mappers/controlplane')>(
    'components/pages/shadowlinks/mappers/controlplane'
  );
  return {
    fromControlplaneShadowLink: rs.fn(),
    buildDefaultFormValuesFromControlplane: rs.fn(actual.buildDefaultFormValuesFromControlplane),
  };
});

const mockIsEmbedded = rs.mocked(isEmbedded);
const mockUseControlplaneGetShadowLinkByNameQuery = rs.mocked(useControlplaneGetShadowLinkByNameQuery);
const mockFromControlplaneShadowLink = rs.mocked(fromControlplaneShadowLink);
const mockUseControlplaneDeleteShadowLinkMutation = rs.mocked(useControlplaneDeleteShadowLinkMutation);

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

const createMockControlplaneResponse = (overrides: MessageInitShape<typeof ControlplaneShadowLinkSchema> = {}) =>
  create(ControlplaneShadowLinkSchema, {
    id: 'cp-id-456',
    name: 'test-shadow-link',
    state: ControlplaneShadowLinkState.ACTIVE,
    shadowRedpandaId: 'sr-456',
    createdAt: timestampFromDate(new Date('2025-01-01T00:00:00Z')),
    updatedAt: timestampFromDate(new Date('2025-01-02T00:00:00Z')),
    ...overrides,
  });

const mockControlplaneQueryData = (data: ControlplaneShadowLink | undefined) => {
  mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: rs.fn(() => Promise.resolve()),
  });
};

/** Renders the unified hook over a dataplane GetShadowLink handler and waits until loading settles. */
const renderLoadedUnifiedHook = async (getShadowLinkResponse: () => GetShadowLinkResponse, waitTimeout?: number) => {
  const mockGetShadowLink = rs.fn();
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getShadowLink, (request) => {
      mockGetShadowLink(request);
      return getShadowLinkResponse();
    });
  });

  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

  const { result } = renderHook(() => useGetShadowLinkUnified({ name: 'test-shadow-link' }), { wrapper });

  // Wait for data to load
  await waitFor(
    () => {
      expect(result.current.isLoading).toBe(false);
    },
    waitTimeout === undefined ? undefined : { timeout: waitTimeout }
  );
  return { result, mockGetShadowLink };
};

/** The dataplane read always runs; the controlplane read is enabled only in embedded mode. */
const expectShadowLinkQueries = (mockGetShadowLink: ReturnType<typeof rs.fn>, controlplaneEnabled: boolean) => {
  expect(mockGetShadowLink).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-shadow-link' }));
  expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
    { name: 'test-shadow-link' },
    { enabled: controlplaneEnabled }
  );
};

const createPartialUnifiedData = () => ({
  name: 'test-shadow-link',
  id: 'cp-id-456',
  state: UnifiedShadowLinkState.ACTIVE,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
  shadowRedpandaId: 'sr-456',
});

const expectPartialControlplaneData = (data: { name?: string; id?: string; shadowRedpandaId?: string } | undefined) => {
  expect(data?.name).toBe('test-shadow-link');
  expect(data?.id).toBe('cp-id-456');
  expect(data?.shadowRedpandaId).toBe('sr-456');
};

describe('useGetShadowLinkUnified', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('returns dataplane data in non-embedded mode', async () => {
    // Setup: non-embedded mode
    mockIsEmbedded.mockReturnValue(false);

    // Mock controlplane to return nothing (not enabled)
    mockControlplaneQueryData(undefined);

    const mockShadowLink = createMockDataplaneShadowLink();
    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() =>
      create(GetShadowLinkResponseSchema, { shadowLink: mockShadowLink })
    );

    // Verify dataplane query was called, and controlplane query called with enabled: false
    expectShadowLinkQueries(mockGetShadowLink, false);

    // Verify data comes from dataplane
    expect(result.current.data?.name).toBe('test-shadow-link');
    expect(result.current.data?.id).toBe('test-uid-123');
    expect(result.current.data?.state).toBe(UnifiedShadowLinkState.ACTIVE);
    expect(result.current.error).toBeNull();

    // Verify controlplane fields are NOT set
    expect(result.current.data?.shadowRedpandaId).toBeUndefined();
  });

  test('returns merged data with controlplane state in embedded mode', async () => {
    // Setup: embedded mode
    mockIsEmbedded.mockReturnValue(true);

    // Mock controlplane to return data
    mockControlplaneQueryData(createMockControlplaneResponse());

    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() =>
      create(GetShadowLinkResponseSchema, { shadowLink: createMockDataplaneShadowLink() })
    );

    // Verify dataplane query was called, and controlplane query called with enabled: true
    expectShadowLinkQueries(mockGetShadowLink, true);

    // Verify basic data from dataplane
    expect(result.current.data?.name).toBe('test-shadow-link');

    // Verify controlplane overrides are applied
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

    // Mock controlplane to return data
    const mockControlplaneData = createMockControlplaneResponse();
    mockControlplaneQueryData(mockControlplaneData);

    // Mock the controlplane mapper to return partial data
    mockFromControlplaneShadowLink.mockReturnValue(createPartialUnifiedData());

    // Dataplane failure: the transport throws. Wait for data to load (dataplane will fail after retry, but
    // controlplane succeeds); increased timeout to account for retry: 1 in embedded mode.
    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() => {
      throw new Error('Dataplane unavailable');
    }, 3000);

    // Verify dataplane query was called (and failed), and controlplane query called with enabled: true
    expectShadowLinkQueries(mockGetShadowLink, true);

    // Verify dataplane error is captured
    expect(result.current.dataplaneError).not.toBeNull();

    // Verify fromControlplaneShadowLink was called as fallback
    expect(mockFromControlplaneShadowLink).toHaveBeenCalledWith(mockControlplaneData);

    // Verify partial data from controlplane fallback
    expectPartialControlplaneData(result.current.data);

    // No combined error since we have data from controlplane fallback
    expect(result.current.error).toBeNull();
  });
});

describe('useEditShadowLink', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  const renderEditHook = () => {
    // Dataplane transport exists but is never queried in embedded mode
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, () => create(GetShadowLinkResponseSchema, {}));
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    return renderHook(() => useEditShadowLink('test-shadow-link'), { wrapper });
  };

  // The edit page derives all API-mode behavior (locked tabs, gate-off
  // read-only card) from the hydrated form values, so the mode must survive
  // hydration from controlplane data.
  test('hydrates API mode from controlplane data in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);
    mockControlplaneQueryData(
      createMockControlplaneResponse({
        schemaRegistrySyncOptions: {
          schemaRegistryShadowingMode: {
            case: 'shadowSchemaRegistryApi',
            value: { sourceUrl: 'https://sr.example.com' },
          },
        },
      })
    );

    const { result } = renderEditHook();

    await waitFor(() => {
      expect(result.current.hasData).toBe(true);
    });
    expect(result.current.formValues?.schemaRegistry.mode).toBe('api');
  });

  test('hydrates topic mode (not api) for a topic-mode controlplane link in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);
    mockControlplaneQueryData(
      createMockControlplaneResponse({
        schemaRegistrySyncOptions: {
          schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} },
        },
      })
    );

    const { result } = renderEditHook();

    await waitFor(() => {
      expect(result.current.hasData).toBe(true);
    });
    expect(result.current.formValues?.schemaRegistry.mode).toBe('topic');
  });
});

/** Embedded mode, the controlplane lookup, and a controlplane delete mutation to observe. */
const setupDeleteMocks = (embedded: boolean, controlplaneData: ControlplaneShadowLink | undefined) => {
  mockIsEmbedded.mockReturnValue(embedded);
  mockControlplaneQueryData(controlplaneData);

  const observer = new MutationObserver<
    ControlplaneDeleteOperation,
    ConnectError,
    MessageInit<ControlplaneDeleteRequest>
  >(new QueryClient(), { mutationFn: () => Promise.resolve(create(ControlplaneDeleteOperationSchema)) });
  const current = observer.getCurrentResult();
  const mockControlplaneMutate = rs.fn<ReturnType<typeof useControlplaneDeleteShadowLinkMutation>['mutate']>();
  mockUseControlplaneDeleteShadowLinkMutation.mockReturnValue({
    ...current,
    mutate: mockControlplaneMutate,
    mutateAsync: current.mutate,
  });

  return { mockControlplaneMutate, mockDataplaneDelete: rs.fn() };
};

/** Renders the delete hook over a transport whose dataplane delete reports to `mockDataplaneDelete`. */
const renderDeleteHook = (mockDataplaneDelete: ReturnType<typeof rs.fn>) => {
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getShadowLink, () => create(GetShadowLinkResponseSchema, {}));
    rpc(deleteShadowLink, (request) => {
      mockDataplaneDelete(request);
      return create(DeleteShadowLinkResponseSchema, {});
    });
  });

  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

  return renderHook(() => useDeleteShadowLinkUnified({ name: 'test-shadow-link' }), { wrapper });
};

describe('useDeleteShadowLinkUnified', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('calls controlplane delete mutation when in embedded mode and does NOT call dataplane', () => {
    // Setup: embedded mode, with the controlplane query returning a shadowlink with ID
    const { mockControlplaneMutate, mockDataplaneDelete } = setupDeleteMocks(
      true,
      createMockControlplaneResponse({ id: 'cp-shadow-link-id-123', name: 'test-shadow-link' })
    );

    // The transport's dataplane delete mock verifies it's NOT called
    const { result } = renderDeleteHook(mockDataplaneDelete);

    // Verify controlplane query was called with enabled: true
    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: true }
    );

    // Verify canDelete is true (ID is available)
    expect(result.current.canDelete).toBe(true);

    // Call delete function
    const callbacks = { onSuccess: rs.fn(), onError: rs.fn() };
    result.current.deleteShadowLink({ force: false, ...callbacks });

    // Verify controlplane mutation was called with the ID
    expect(mockControlplaneMutate).toHaveBeenCalledWith({ id: 'cp-shadow-link-id-123' }, callbacks);

    // Verify dataplane delete was NOT called
    expect(mockDataplaneDelete).not.toHaveBeenCalled();
  });

  test('calls dataplane delete mutation when not in embedded mode and does NOT call controlplane', async () => {
    // Setup: non-embedded mode, controlplane query returns nothing (not enabled), and its delete
    // mutation is mocked to verify it's NOT called
    const { mockControlplaneMutate, mockDataplaneDelete } = setupDeleteMocks(false, undefined);

    const { result } = renderDeleteHook(mockDataplaneDelete);

    // Verify controlplane query was called with enabled: false
    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: false }
    );

    // Verify canDelete is true (always true in non-embedded mode)
    expect(result.current.canDelete).toBe(true);

    // Call delete function
    result.current.deleteShadowLink({ force: true, onSuccess: rs.fn(), onError: rs.fn() });

    // Wait for the dataplane delete mutation to be called
    await waitFor(() => {
      expect(mockDataplaneDelete).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-shadow-link', force: true })
      );
    });

    // Verify controlplane mutation was NOT called
    expect(mockControlplaneMutate).not.toHaveBeenCalled();
  });
});

describe('useFailoverShadowLinkMutation', () => {
  const setup = (refreshTopics: boolean) => {
    const reads = { topics: 0 };
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listShadowLinkTopics, () => {
        reads.topics += 1;
        return { shadowTopics: [] };
      });
      rpc(failOver, () => ({ name: 'test-shadow-link' }));
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const onSuccess = rs.fn();
    const { result } = renderHook(
      () => ({
        topics: useListShadowTopicQuery({ shadowLinkName: 'test-shadow-link', pageSize: -1 }),
        failover: useFailoverShadowLinkMutation({ onSuccess, refreshTopics }),
      }),
      { wrapper }
    );
    const failOverLink = () => result.current.failover.mutate({ name: 'test-shadow-link' });
    return { reads, result, onSuccess, failOverLink };
  };

  test('re-reads the link’s topics once the failover is accepted, so their state shows straight away', async () => {
    const { reads, result, failOverLink } = setup(true);
    await waitFor(() => expect(result.current.topics.isSuccess).toBe(true));
    expect(reads.topics).toBe(1);

    failOverLink();

    await waitFor(() => expect(reads.topics).toBe(2));
  });

  test('leaves the topics alone unless asked, as it did before the Failover tab', async () => {
    const { reads, result, onSuccess, failOverLink } = setup(false);
    await waitFor(() => expect(result.current.topics.isSuccess).toBe(true));

    failOverLink();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith());
    expect(reads.topics).toBe(1);
  });
});
