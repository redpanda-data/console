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

import { BrokerDetails } from '../../components/pages/overview/broker-details';

export const Route = createFileRoute('/overview/$brokerId')({
  staticData: {
    title: 'Broker Details',
  },
  component: BrokerDetailsWrapper,
});

function BrokerDetailsWrapper() {
  const { brokerId } = useParams({ from: '/overview/$brokerId' });
  return <BrokerDetails brokerId={brokerId} matchedPath={`/overview/${brokerId}`} />;
}
