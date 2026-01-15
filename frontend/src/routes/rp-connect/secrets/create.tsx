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

import RpConnectSecretCreate from '../../../components/pages/rp-connect/secrets/secrets-create';

export const Route = createFileRoute('/rp-connect/secrets/create')({
  staticData: {
    title: 'Create Connector Secret',
  },
  component: SecretCreateWrapper,
});

function SecretCreateWrapper() {
  return <RpConnectSecretCreate matchedPath="/rp-connect/secrets/create" />;
}
