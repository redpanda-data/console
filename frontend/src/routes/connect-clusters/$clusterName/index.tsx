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

import KafkaClusterDetails from '../../../components/pages/connect/cluster-details';

export const Route = createFileRoute('/connect-clusters/$clusterName/')({
  staticData: {
    title: 'Connect Cluster',
  },
  component: ClusterDetailsWrapper,
});

function ClusterDetailsWrapper() {
  const { clusterName } = useParams({ from: '/connect-clusters/$clusterName/' });
  return <KafkaClusterDetails clusterName={clusterName} matchedPath={`/connect-clusters/${clusterName}`} />;
}
