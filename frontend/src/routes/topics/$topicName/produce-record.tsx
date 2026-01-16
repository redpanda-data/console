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

import { TopicProducePage } from '../../../components/pages/topics/topic-produce';

export const Route = createFileRoute('/topics/$topicName/produce-record')({
  staticData: {
    title: 'Produce Record',
  },
  component: TopicProduceWrapper,
});

function TopicProduceWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/produce-record' });
  return <TopicProducePage matchedPath={`/topics/${topicName}/produce-record`} topicName={topicName} />;
}
