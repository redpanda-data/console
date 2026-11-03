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

import { createFileRoute, useSearch } from '@tanstack/react-router';
import { LinkIcon } from 'components/icons';
import { z } from 'zod';

import KafkaConnectOverview from '../../components/pages/connect/overview';
import { pipelineListSearchSchema } from '../../components/pages/rp-connect/pipeline/list-search';

const connectViewValues = ['kafka-connect', 'redpanda-connect', 'redpanda-connect-secret'] as const;

// The Redpanda Connect pipelines list renders here and keeps its view in these params too.
const searchSchema = z.object({
  defaultTab: z.enum(connectViewValues).optional().catch(undefined),
  ...pipelineListSearchSchema.shape,
});

export type ConnectClustersSearchParams = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/connect-clusters/')({
  staticData: {
    title: 'Connect',
    icon: LinkIcon,
  },
  validateSearch: searchSchema,
  component: ConnectOverviewWrapper,
});

function ConnectOverviewWrapper() {
  const search = useSearch({ from: '/connect-clusters/' });
  return <KafkaConnectOverview defaultTab={search.defaultTab} matchedPath="/connect-clusters" />;
}
