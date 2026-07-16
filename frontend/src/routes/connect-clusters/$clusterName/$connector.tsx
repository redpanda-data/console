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
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { z } from 'zod';

import KafkaConnectorDetails from '../../../components/pages/connect/connector-details';

const searchSchema = z.object({
  pageSize: z.number().int().positive().optional().catch(DEFAULT_TABLE_PAGE_SIZE),
  page: z.number().int().nonnegative().optional().catch(0),
});

export const Route = createFileRoute('/connect-clusters/$clusterName/$connector')({
  staticData: {
    title: 'Connector Details',
  },
  validateSearch: searchSchema,
  component: ConnectorDetailsWrapper,
});

function ConnectorDetailsWrapper() {
  const { clusterName, connector } = useParams({ from: '/connect-clusters/$clusterName/$connector' });
  return (
    <KafkaConnectorDetails
      clusterName={clusterName}
      connector={connector}
      matchedPath={`/connect-clusters/${clusterName}/${connector}`}
    />
  );
}
