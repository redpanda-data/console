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

import { createFileRoute, useParams } from '@tanstack/react-router';

import TopicDetails from '../../../components/pages/topics/topic-details';

export const Route = createFileRoute('/topics/$topicName/')({
  staticData: {
    title: 'Topic Details',
  },
  component: TopicDetailsWrapper,
});

function TopicDetailsWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });
  return <TopicDetails matchedPath={`/topics/${topicName}`} topicName={topicName} />;
}
