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

import { createFileRoute, redirect, useParams } from '@tanstack/react-router';
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { z } from 'zod';

import TopicDetails from '../../../components/pages/topics/topic-details';

const searchSchema = z.object({
  pageSize: z.number().int().positive().optional().catch(DEFAULT_TABLE_PAGE_SIZE),
  page: z.number().int().nonnegative().optional().catch(0),
  configFilter: z.string().optional().catch(undefined),
  configScope: z.enum(['all', 'modified']).optional().catch(undefined),
});

export const Route = createFileRoute('/topics/$topicName/')({
  staticData: {
    title: 'Topic Details',
  },
  // Guards a nuqs/router race: navigating away from this route (e.g. clicking the
  // "Topics" breadcrumb) while a query-param update is still queued can cause that
  // update to flush after the route already changed, re-navigating here with a
  // stale relative `from` and no resolvable topicName — TanStack Router then
  // interpolates the literal string "undefined" into the path. Bounce back to the
  // topic list instead of rendering a confusing "topic undefined does not exist" 404.
  beforeLoad: ({ params }) => {
    if (params.topicName === 'undefined') {
      throw redirect({ to: '/topics', replace: true });
    }
  },
  validateSearch: searchSchema,
  component: TopicDetailsWrapper,
});

function TopicDetailsWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });
  return <TopicDetails matchedPath={`/topics/${topicName}`} topicName={topicName} />;
}
