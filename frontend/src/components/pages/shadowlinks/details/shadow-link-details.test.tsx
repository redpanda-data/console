import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import {
  ListShadowLinkTopicsResponseSchema,
  ShadowTopicSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { listShadowLinkTopics } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { ShadowLinkDetails } from './shadow-link-details';
import { type UnifiedShadowLink, UnifiedShadowLinkState } from '../model';

rs.mock('./shadow-link-diagram', () => ({ ShadowLinkDiagram: MockNothing }));
rs.mock('./shadow-link-metrics', () => ({ ShadowLinkMetrics: MockNothing }));

const shadowLink: UnifiedShadowLink = {
  name: 'link-a',
  id: 'link-a-uid',
  state: UnifiedShadowLinkState.ACTIVE,
  configurations: undefined,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
};

// The first page loads and announces a second page; every later page fails.
function secondPageFailsTransport(nextPageRequests: string[]) {
  return createRouterTransport(({ rpc }) => {
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

// The unfiltered list stalls on its second page until that page is failed; the "p" filter's first
// page is held back, so the stale failure settles before the filtered list can paginate.
function filterChangeScenario() {
  const requests: string[] = [];
  const stalledPage = Promise.withResolvers<never>();
  const filteredFirstPage = Promise.withResolvers<void>();
  const transport = createRouterTransport(({ rpc }) => {
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

describe('the ShadowLinkDetails topic pagination', () => {
  beforeEach(() => {
    // Happy DOM has no layout; give the virtualized scroll area a height so its rows render.
    rs.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  test('shows a next-page failure without refetching until the user retries', async () => {
    const user = userEvent.setup();
    const nextPageRequests: string[] = [];
    renderWithFileRoutes(
      <ShadowLinkDetails onFailoverTopic={rs.fn()} shadowLink={shadowLink} shadowLinkName="link-a" />,
      { transport: secondPageFailsTransport(nextPageRequests) }
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('page 2 unavailable');
    expect(nextPageRequests).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(nextPageRequests).toHaveLength(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('page 2 unavailable');
    expect(nextPageRequests).toHaveLength(2);
  });

  test('paginates a new filter even when the previous filter page fails afterwards', async () => {
    const user = userEvent.setup();
    const scenario = filterChangeScenario();
    renderWithFileRoutes(
      <ShadowLinkDetails onFailoverTopic={rs.fn()} shadowLink={shadowLink} shadowLinkName="link-a" />,
      { transport: scenario.transport }
    );

    await waitFor(() => expect(scenario.requests).toContain(':all-page-2'));
    await user.type(screen.getByTestId('filter-topics-input'), 'p');
    scenario.failStalledPage();
    scenario.releaseFilteredPage();

    await waitFor(() => expect(scenario.requests).toContain('p:p-page-2'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function MockNothing() {
  return null;
}
