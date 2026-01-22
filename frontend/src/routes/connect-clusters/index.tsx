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
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { LinkIcon } from 'components/icons';
import { z } from 'zod';

import KafkaConnectOverview from '../../components/pages/connect/overview';

const connectViewValues = ['kafka-connect', 'redpanda-connect', 'redpanda-connect-secret'] as const;

const searchSchema = z.object({
  defaultTab: fallback(z.enum(connectViewValues).optional(), undefined),
});

export type ConnectClustersSearchParams = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/connect-clusters/')({
  staticData: {
    title: 'Connect',
    icon: LinkIcon,
  },
  validateSearch: zodValidator(searchSchema),
  component: ConnectOverviewWrapper,
});

function ConnectOverviewWrapper() {
  const search = useSearch({ from: '/connect-clusters/' });
  return <KafkaConnectOverview defaultTab={search.defaultTab} matchedPath="/connect-clusters" />;
}
