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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { appGlobal } from 'state/app-global';
import { useApiStore } from 'state/backend-api';
import type { Topic, TopicAction } from 'state/rest-interfaces';
import { createTestRouterFromFiles, renderWithFileRoutes, screen } from 'test-utils';

import { TopicDetails } from './topic-details';

// Delegates to the real store-backed proxy so `api.topics` reads the test state; refreshes are no-ops.
rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  const refresh = rs.fn(() => Promise.resolve());
  return {
    ...actual,
    api: new Proxy(actual.api, {
      get: (target, prop): unknown =>
        typeof prop === 'string' && prop.startsWith('refresh') ? refresh : Reflect.get(target, prop),
    }),
  };
});

// Mounting the messages tab is what starts a message search.
function MockTopicMessagesTab() {
  return <div data-testid="topic-messages-tab" />;
}

rs.mock('./messages', () => ({ TopicMessagesTab: MockTopicMessagesTab }));

const TOPIC_NAME = 'orders';

const makeTopic = (allowedActions: TopicAction[] | undefined): Topic => ({
  topicName: TOPIC_NAME,
  isInternal: false,
  partitionCount: 1,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: null, hint: null },
  allowedActions,
});

const renderTopicDetails = () => {
  const initialLocation = `/topics/${TOPIC_NAME}#messages`;
  appGlobal.setLocation(createTestRouterFromFiles(initialLocation).latestLocation);
  return renderWithFileRoutes(<TopicDetails matchedPath={`/topics/${TOPIC_NAME}`} topicName={TOPIC_NAME} />, {
    initialLocation,
  });
};

describe('the TopicDetails messages tab', () => {
  beforeEach(() => {
    useApiStore.setState({ topics: null });
  });

  test('explains the missing permission instead of searching a topic the user cannot read', async () => {
    useApiStore.setState({
      topics: [makeTopic(['seeTopic', 'viewPartitions', 'viewConsumers', 'viewConfig'])],
    });

    renderTopicDetails();

    expect(await screen.findByText('Not authorized to read messages')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('topic-messages-tab')).not.toBeInTheDocument();
  });

  test('shows the messages of a topic the user can read', async () => {
    useApiStore.setState({ topics: [makeTopic(undefined)] });

    renderTopicDetails();

    expect(await screen.findByTestId('topic-messages-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-permission-notice')).not.toBeInTheDocument();
  });
});
