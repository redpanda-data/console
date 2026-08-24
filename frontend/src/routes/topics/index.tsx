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

import { createFileRoute } from '@tanstack/react-router';
import { CollectionIcon } from 'components/icons';

import { prefetchTopicsRouteData } from './-loader';
import { topicsSearchSchema } from './-search';
import TopicList from '../../components/pages/topics/topic-list-new';
import { RouteError } from '../../components/routes/route-error';

export const Route = createFileRoute('/topics/')({
  staticData: {
    title: 'Topics',
    icon: CollectionIcon,
  },
  validateSearch: topicsSearchSchema,
  loader: ({ context: { queryClient } }) => prefetchTopicsRouteData(queryClient),
  errorComponent: RouteError,
  component: TopicList,
});
