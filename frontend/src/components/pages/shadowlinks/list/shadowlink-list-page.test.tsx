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

import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { afterEach, describe, expect, test } from '@rstest/core';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListShadowLinksRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { ClusterFenceState } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { Toaster } from 'sonner';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

import { ShadowLinkListPage } from './shadowlink-list-page';

type LinksReply = MessageInitShape<typeof listShadowLinks.output>;
type FenceReply = MessageInitShape<typeof getClusterFenceStatus.output>;

type PageOptions = {
  initialLocation?: string;
  fence?: FenceReply | Promise<FenceReply>;
  links?: () => LinksReply | Promise<LinksReply>;
};

const resolvingTopology = { clusterName: 'dr', readers: [], sources: {}, resolving: true, readersIncomplete: false };
const CREATE_SHADOW_LINK = /create shadow link/iu;
const NO_PERMISSION = /don't have permission to view shadow links/iu;
const FENCE_CREATION_BLOCK = /rejects new shadow links/iu;
const ERROR_TOAST = 'Failed to load shadowlinks';
const SOURCE_PANEL = 'cluster-fence-source-panel';

const unfenced = { fence: { state: ClusterFenceState.UNFENCED, revision: 1n } } satisfies FenceReply;
const fenced = { fence: { state: ClusterFenceState.FENCED, revision: 3n } } satisfies FenceReply;

function serveLinks({ fence, links = () => ({}) }: PageOptions) {
  useSupportedFeaturesStore.setState({ clusterFence: fence !== undefined });
  return createRouterTransport(({ rpc }) => {
    rpc(listShadowLinks, links);
    rpc(getClusterFenceStatus, () => fence ?? unfenced);
  });
}

function renderLinks({ initialLocation = '/shadowlinks', ...api }: PageOptions = {}) {
  const transport = serveLinks(api);
  return renderWithFileRoutes(
    <>
      <ShadowLinkListPage />
      <Toaster />
    </>,
    { initialLocation, transport }
  );
}

async function publishUnfencedStatus(status: PromiseWithResolvers<FenceReply>) {
  await act(async () => {
    status.resolve(unfenced);
    await status.promise;
  });
  await waitFor(() => expect(useClusterFenceStore.getState().phase).toBe('unfenced'));
}

async function arrangeListRetry() {
  const retry = Promise.withResolvers<LinksReply>();
  let reads = 0;
  const transport = serveLinks({
    fence: fenced,
    links: () => {
      reads += 1;
      if (reads === 1) {
        throw new ConnectError('temporary failure', Code.Internal);
      }
      return retry.promise;
    },
  });
  const { rerender, router } = renderWithFileRoutes(null, { initialLocation: '/shadowlinks', transport });
  const { queryClient } = router.options.context;
  const query = createQueryOptions(listShadowLinks, create(ListShadowLinksRequestSchema), { transport });
  await expect(queryClient.fetchQuery(query)).rejects.toThrow('temporary failure');
  const reloading = queryClient.fetchQuery(query);
  const finishRetry = async () => {
    retry.resolve({ shadowLinks: [] });
    await reloading;
  };
  return { rerender, finishRetry };
}

afterEach(() => {
  useSupportedFeaturesStore.setState({ clusterFence: useSupportedFeaturesStore.getInitialState().clusterFence });
  useClusterFenceStore.getState().setTopology(null);
  useClusterFenceStore.getState().setPhase(null);
});

describe('the shadow link list without cluster fencing', () => {
  test('shows a no-permission state, without an error card or toast, on PermissionDenied', async () => {
    renderLinks({
      links: () => {
        throw new ConnectError('you are not authorized to call this endpoint', Code.PermissionDenied);
      },
    });

    expect(await screen.findByTestId('shadowlink-no-permission-card')).toBeVisible();
    expect(screen.getByText(NO_PERMISSION)).toBeVisible();
    expect(screen.queryByTestId('shadowlink-error-card')).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_TOAST)).not.toBeInTheDocument();
  });

  test('shows a retry card and an error toast on unexpected failures', async () => {
    renderLinks({
      links: () => {
        throw new ConnectError('unexpected failure', Code.Internal);
      },
    });

    expect(await screen.findByTestId('shadowlink-error-card')).toBeVisible();
    expect(await screen.findByText(ERROR_TOAST)).toBeVisible();
    expect(screen.queryByTestId('shadowlink-no-permission-card')).not.toBeInTheDocument();
  });

  test.each(['/shadowlinks', '/shadowlinks?tab=source'])(
    'shows no fence tab without fencing support: %s',
    async (initialLocation) => {
      renderLinks({ initialLocation });

      expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeVisible();
      expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
      expect(screen.queryByTestId(SOURCE_PANEL)).not.toBeInTheDocument();
    }
  );
});

describe('opening the cluster fence tab', () => {
  test('a cluster with no known readers opens its links and can still open the fence tab', async () => {
    const user = userEvent.setup();
    useClusterFenceStore.getState().setTopology({
      clusterName: 'dr',
      readers: [],
      sources: {},
      resolving: false,
      readersIncomplete: false,
    });
    const { router } = renderLinks({ fence: unfenced });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeVisible();
    expect(screen.queryByTestId(SOURCE_PANEL)).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'links' }));
    await user.click(screen.getByTestId('shadowlinks-tab-source'));
    expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
  });

  test('defaults to the fence for a self-hosted cluster with no topology', async () => {
    renderLinks({ fence: unfenced });

    expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
    expect(screen.getByTestId('shadowlinks-tabs')).toBeVisible();
  });

  test.each([ShadowLinkState.ACTIVE, ShadowLinkState.FAILED_OVER])(
    'defaults to links when the cluster has a link of its own in state %s',
    async (state) => {
      const { router } = renderLinks({
        fence: unfenced,
        links: () => ({ shadowLinks: [{ name: 'orders-dr', bootstrapServers: ['example.test:9092'], state }] }),
      });

      expect(await screen.findByTestId('shadowlink-row-orders-dr')).toBeVisible();
      expect(screen.getByTestId('shadowlinks-tab-source')).toBeVisible();
      await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'links' }));
    }
  );

  test('waits for both the fence response and Cloud topology before choosing a tab', async () => {
    const status = Promise.withResolvers<FenceReply>();
    useClusterFenceStore.getState().setTopology(resolvingTopology);
    renderLinks({ fence: status.promise });

    try {
      expect(await screen.findByTestId('shadowlinks-tab-loading')).toBeVisible();
      await publishUnfencedStatus(status);
      expect(screen.getByTestId('shadowlinks-tab-loading')).toBeVisible();

      act(() => useClusterFenceStore.getState().setTopology({ ...resolvingTopology, resolving: false }));
      expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeVisible();
    } finally {
      status.resolve(unfenced);
    }
  });

  test('honors a deep link to the fence while status is loading', async () => {
    const status = Promise.withResolvers<FenceReply>();
    renderLinks({ initialLocation: '/shadowlinks?tab=source', fence: status.promise });

    try {
      expect(await screen.findByTestId('cluster-fence-source-loading')).toBeVisible();
      expect(screen.queryByTestId('shadowlinks-tab-loading')).not.toBeInTheDocument();
    } finally {
      status.resolve(unfenced);
    }
  });
});

describe('the shadow link list on clusters that can be fenced', () => {
  test('opens a fenced cluster on Cluster fence and syncs the tab to the URL', async () => {
    const { router } = renderLinks({ fence: fenced });

    expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
    expect(screen.getByTestId('shadowlinks-tab-source')).toHaveTextContent('Cluster fence');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'source' }));
  });

  test('opens the fence when Cloud reports downstream readers', async () => {
    useClusterFenceStore.getState().setTopology({
      clusterName: 'prod',
      readers: [
        {
          linkName: 'orders-dr',
          shadowClusterId: 'dr',
          shadowClusterName: 'dr',
          authentication: 'sasl',
          principal: 'shadow-orders',
        },
      ],
      sources: {},
      resolving: false,
      readersIncomplete: false,
    });
    renderLinks({ fence: unfenced });

    expect(await screen.findByTestId('cluster-fence-reader-orders-dr')).toBeVisible();
  });

  test('keeps the fence available when shadow linking itself is disabled', async () => {
    const user = userEvent.setup();
    renderLinks({
      fence: unfenced,
      links: () => {
        throw new ConnectError('Cluster link feature is disabled', Code.FailedPrecondition);
      },
    });

    expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
    await user.click(screen.getByTestId('shadowlinks-tab-links'));
    expect(await screen.findByTestId('shadowlink-feature-disabled-card')).toBeVisible();
  });

  test('keeps its default fence tab while a failed list reloads', async () => {
    const { rerender, finishRetry } = await arrangeListRetry();

    try {
      rerender(<ShadowLinkListPage />);
      expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
      expect(screen.getByTestId('shadowlinks-tabs')).toBeVisible();
      expect(screen.queryByTestId('shadowlinks-tab-loading')).not.toBeInTheDocument();
    } finally {
      await finishRetry();
    }
  });

  test('does not write the default tab after the router has moved to another page', async () => {
    const { router } = renderLinks({ initialLocation: '/topics', fence: fenced });

    expect(await screen.findByTestId(SOURCE_PANEL)).toBeVisible();
    expect(router.history.location.pathname).toBe('/topics');
  });

  test('explains why a fenced cluster cannot create a shadow link', async () => {
    renderLinks({ initialLocation: '/shadowlinks?tab=links', fence: fenced });

    const createButton = await screen.findByTestId('create-shadowlink-button');
    await waitFor(() => expect(createButton).toBeDisabled());
    expect(screen.getByText(FENCE_CREATION_BLOCK)).toBeInTheDocument();
  });
});
