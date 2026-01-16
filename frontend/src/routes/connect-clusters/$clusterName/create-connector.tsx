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

import CreateConnector from '../../../components/pages/connect/create-connector';

export const Route = createFileRoute('/connect-clusters/$clusterName/create-connector')({
  staticData: {
    title: 'Create Connector',
  },
  component: CreateConnectorWrapper,
});

function CreateConnectorWrapper() {
  const { clusterName } = useParams({ from: '/connect-clusters/$clusterName/create-connector' });
  return (
    <CreateConnector clusterName={clusterName} matchedPath={`/connect-clusters/${clusterName}/create-connector`} />
  );
}
