// Copyright 2026 Redpanda Data, Inc.

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport, type Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { describe, expect, onTestFinished, test } from '@rstest/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ListShadowLinkTopicsResponseSchema,
  ShadowTopicSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  getShadowMetrics,
  listShadowLinkTopics,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';

import { ShadowLinkDetails } from './shadow-link-details';
import { type UnifiedShadowLink, UnifiedShadowLinkState } from '../model';

const shadowLink: UnifiedShadowLink = {
  name: 'link-a',
  id: 'link-a-uid',
  state: UnifiedShadowLinkState.ACTIVE,
  configurations: undefined,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
};

function secondPageFailsTransport(nextPageRequests: string[]) {
  return createRouterTransport(({ rpc }) => {
    rpc(getShadowMetrics, () => ({}));
    rpc(listShadowLinkTopics, (request) => {
      if (!request.pageToken) {
        return create(ListShadowLinkTopicsResponseSchema, {
          shadowTopics: [create(ShadowTopicSchema, { topicName: 'orders' })],
          nextPageToken: 'page-2',
        });
      }
      nextPageRequests.push(request.pageToken);
      throw new ConnectError('page 2 unavailable', Code.Unavailable);
    });
  });
}

const topicsPage = (topicName: string, nextPageToken: string) =>
  create(ListShadowLinkTopicsResponseSchema, {
    shadowTopics: [create(ShadowTopicSchema, { topicName })],
    nextPageToken,
  });

function filterChangeScenario() {
  const requests: string[] = [];
  const stalledPage = Promise.withResolvers<never>();
  const filteredFirstPage = Promise.withResolvers<void>();
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getShadowMetrics, () => ({}));
    rpc(listShadowLinkTopics, async (request) => {
      const filter = request.filter?.topicNameContains ?? '';
      requests.push(`${filter}:${request.pageToken}`);
      if (filter === '') {
        return request.pageToken ? stalledPage.promise : topicsPage('orders', 'all-page-2');
      }
      if (request.pageToken) {
        return topicsPage('payments-2', '');
      }
      await filteredFirstPage.promise;
      return topicsPage('payments', 'p-page-2');
    });
  });
  return {
    requests,
    transport,
    failStalledPage: () => stalledPage.reject(new ConnectError('previous filter page failed', Code.Unavailable)),
    releaseFilteredPage: () => filteredFirstPage.resolve(),
  };
}

function DetailsPage() {
  return <ShadowLinkDetails onFailoverTopic={() => undefined} shadowLink={shadowLink} shadowLinkName="link-a" />;
}

function renderDetails(transport: Transport) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const history = createMemoryHistory();
  const router = createRouter({ routeTree: createRootRoute({ component: DetailsPage }), history });
  onTestFinished(async () => {
    history.destroy();
    await queryClient.cancelQueries();
    queryClient.clear();
  });
  return render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>
  );
}

describe('the ShadowLinkDetails topic pagination', () => {
  test('shows a next-page failure without refetching until the user retries', async () => {
    const user = userEvent.setup();
    const nextPageRequests: string[] = [];
    renderDetails(secondPageFailsTransport(nextPageRequests));

    expect((await screen.findByRole('alert')).textContent).toContain('page 2 unavailable');
    expect(nextPageRequests).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(nextPageRequests).toHaveLength(2));
    expect((await screen.findByRole('alert')).textContent).toContain('page 2 unavailable');
    expect(nextPageRequests).toHaveLength(2);
  });

  test('paginates a new filter even when the previous filter page fails afterwards', async () => {
    const user = userEvent.setup();
    const scenario = filterChangeScenario();
    renderDetails(scenario.transport);

    await waitFor(() => expect(scenario.requests).toContain(':all-page-2'));
    await user.type(screen.getByTestId('filter-topics-input'), 'p');
    scenario.failStalledPage();
    scenario.releaseFilteredPage();

    await waitFor(() => expect(scenario.requests).toContain('p:p-page-2'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
