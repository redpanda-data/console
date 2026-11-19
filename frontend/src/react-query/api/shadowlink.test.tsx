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
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';
import { fromControlplaneShadowLink } from 'components/pages/shadowlinks/mappers/controlplane';
import { UnifiedShadowLinkState } from 'components/pages/shadowlinks/model';
import { isEmbedded } from 'config';
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

rs.mock('config', () => ({
  isEmbedded: rs.fn(),
}));

rs.mock('./controlplane/shadowlink', () => ({
  useControlplaneGetShadowLinkByNameQuery: rs.fn(),
  useControlplaneUpdateShadowLinkMutation: rs.fn(() => ({
    mutateAsync: rs.fn(),
    isPending: false,
  })),
  useControlplaneDeleteShadowLinkMutation: rs.fn(() => ({
    mutate: rs.fn(),
    isPending: false,
  })),
}));

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
  shadowRedpandaId: 'sr-456',
  createdAt: timestampFromDate(new Date('2025-01-01T00:00:00Z')),
  updatedAt: timestampFromDate(new Date('2025-01-02T00:00:00Z')),
});

const mockControlplaneQueryData = (data: unknown) => {
  mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: rs.fn(),
  } as any);
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
    mockIsEmbedded.mockReturnValue(false);

    mockControlplaneQueryData(undefined);

    const mockShadowLink = createMockDataplaneShadowLink();
    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() =>
      create(GetShadowLinkResponseSchema, { shadowLink: mockShadowLink })
    );

    expectShadowLinkQueries(mockGetShadowLink, false);

    expect(result.current.data?.name).toBe('test-shadow-link');
    expect(result.current.data?.id).toBe('test-uid-123');
    expect(result.current.data?.state).toBe(UnifiedShadowLinkState.ACTIVE);
    expect(result.current.error).toBeNull();

    expect(result.current.data?.shadowRedpandaId).toBeUndefined();
  });

  test('returns merged data with controlplane state in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);

    mockControlplaneQueryData(createMockControlplaneResponse());

    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() =>
      create(GetShadowLinkResponseSchema, { shadowLink: createMockDataplaneShadowLink() })
    );

    expectShadowLinkQueries(mockGetShadowLink, true);

    expect(result.current.data?.name).toBe('test-shadow-link');

    expect(result.current.data?.shadowRedpandaId).toBe('sr-456');
    expect(result.current.data?.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
    expect(result.current.data?.updatedAt).toEqual(new Date('2025-01-02T00:00:00Z'));

    expect(result.current.data?.state).toBe(UnifiedShadowLinkState.ACTIVE);
    expect(result.current.error).toBeNull();
  });

  test('returns controlplane data as fallback when dataplane fails in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);

    const mockControlplaneData = createMockControlplaneResponse();
    mockControlplaneQueryData(mockControlplaneData);

    mockFromControlplaneShadowLink.mockReturnValue(createPartialUnifiedData());

    const { result, mockGetShadowLink } = await renderLoadedUnifiedHook(() => {
      throw new Error('Dataplane unavailable');
    }, 3000);

    expectShadowLinkQueries(mockGetShadowLink, true);

    expect(result.current.dataplaneError).not.toBeNull();

    expect(mockFromControlplaneShadowLink).toHaveBeenCalledWith(mockControlplaneData);

    expectPartialControlplaneData(result.current.data);

    expect(result.current.error).toBeNull();
  });
});

describe('useEditShadowLink', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  const renderEditHook = () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, () => create(GetShadowLinkResponseSchema, {}));
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    return renderHook(() => useEditShadowLink('test-shadow-link'), { wrapper });
  };

  // read-only card) from the hydrated form values, so the mode must survive
  test('hydrates API mode from controlplane data in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);
    mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
      data: {
        ...createMockControlplaneResponse(),
        schemaRegistrySyncOptions: {
          schemaRegistryShadowingMode: {
            case: 'shadowSchemaRegistryApi',
            value: { sourceUrl: 'https://sr.example.com' },
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: rs.fn(),
    } as any);

    const { result } = renderEditHook();

    await waitFor(() => {
      expect(result.current.hasData).toBe(true);
    });
    expect(result.current.formValues?.schemaRegistry.mode).toBe('api');
  });

  test('hydrates topic mode (not api) for a topic-mode controlplane link in embedded mode', async () => {
    mockIsEmbedded.mockReturnValue(true);
    mockUseControlplaneGetShadowLinkByNameQuery.mockReturnValue({
      data: {
        ...createMockControlplaneResponse(),
        schemaRegistrySyncOptions: {
          schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} },
        },
      },
      isLoading: false,
      error: null,
      refetch: rs.fn(),
    } as any);

    const { result } = renderEditHook();

    await waitFor(() => {
      expect(result.current.hasData).toBe(true);
    });
    expect(result.current.formValues?.schemaRegistry.mode).toBe('topic');
  });
});

/** Embedded mode, the controlplane lookup, and a controlplane delete mutation to observe. */
const setupDeleteMocks = (embedded: boolean, controlplaneData: unknown) => {
  mockIsEmbedded.mockReturnValue(embedded);
  mockControlplaneQueryData(controlplaneData);

  const mockControlplaneMutate = rs.fn();
  mockUseControlplaneDeleteShadowLinkMutation.mockReturnValue({
    mutate: mockControlplaneMutate,
    isPending: false,
  } as any);

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
    const { mockControlplaneMutate, mockDataplaneDelete } = setupDeleteMocks(true, {
      id: 'cp-shadow-link-id-123',
      name: 'test-shadow-link',
    });

    const { result } = renderDeleteHook(mockDataplaneDelete);

    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: true }
    );

    expect(result.current.canDelete).toBe(true);

    const callbacks = { onSuccess: rs.fn(), onError: rs.fn() };
    result.current.deleteShadowLink({ force: false, ...callbacks });

    expect(mockControlplaneMutate).toHaveBeenCalledWith({ id: 'cp-shadow-link-id-123' }, callbacks);

    expect(mockDataplaneDelete).not.toHaveBeenCalled();
  });

  test('calls dataplane delete mutation when not in embedded mode and does NOT call controlplane', async () => {
    const { mockControlplaneMutate, mockDataplaneDelete } = setupDeleteMocks(false, undefined);

    const { result } = renderDeleteHook(mockDataplaneDelete);

    expect(mockUseControlplaneGetShadowLinkByNameQuery).toHaveBeenCalledWith(
      { name: 'test-shadow-link' },
      { enabled: false }
    );

    expect(result.current.canDelete).toBe(true);

    result.current.deleteShadowLink({ force: true, onSuccess: rs.fn(), onError: rs.fn() });

    await waitFor(() => {
      expect(mockDataplaneDelete).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-shadow-link', force: true })
      );
    });

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
    const failOverLink = () =>
      result.current.failover.mutate({ name: 'test-shadow-link' } as Parameters<
        typeof result.current.failover.mutate
      >[0]);
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

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(reads.topics).toBe(1);
  });
});
