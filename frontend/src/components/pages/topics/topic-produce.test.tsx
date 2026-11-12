/** Copyright 2026 Redpanda Data, Inc. */

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';

import { TopicProducePage } from './topic-produce';
import { config } from '../../../runtime-config';
import { renderWithFileRoutes, screen } from '../../../test-utils';

const fence = rs.hoisted((): { reason: string | undefined } => ({ reason: undefined }));

rs.mock('components/cluster-fence/use-cluster-fence-guard', () => {
  const { isFencedTopicWrite } = rs.requireActual<typeof import('../../cluster-fence/cluster-fence-model')>(
    '../../cluster-fence/cluster-fence-model'
  );
  return {
    useClusterFenceGuard: () => ({
      reasonFor: (action: string, topic?: string) =>
        action === 'produce' && topic !== undefined && isFencedTopicWrite(topic) ? fence.reason : undefined,
      isFencedRead: () => false,
    }),
  };
});

const fallbackFetch = config.fetch;

beforeEach(() => {
  rs.spyOn(config, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.href).pathname;
    if (path.endsWith('/schema-registry/subjects')) {
      return Promise.resolve(Response.json([]));
    }
    if (path.endsWith('/topics')) {
      return Promise.resolve(Response.json({ topics: [] }));
    }
    return fallbackFetch(input, init);
  });
});

afterEach(() => {
  rs.restoreAllMocks();
  fence.reason = undefined;
});

describe('topic produce fencing', () => {
  test.each([
    ['orders', true],
    ['_schemas', true],
    ['__consumer_offsets', false],
  ])('keeps the actual submit control fenced only for its covered topic %s', async (topicName, blocked) => {
    fence.reason = 'Unfence the cluster before producing records.';
    const { unmount } = renderWithFileRoutes(<TopicProducePage topicName={topicName} />, {
      initialLocation: `/topics/${topicName}/produce-record`,
    });
    try {
      const produce = await screen.findByRole('button', { name: 'Produce', exact: true });
      expect(produce).toHaveProperty('disabled', blocked);
    } finally {
      unmount();
    }
  });
});
