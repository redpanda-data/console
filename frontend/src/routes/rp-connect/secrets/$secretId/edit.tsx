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

import RpConnectSecretUpdate from '../../../../components/pages/rp-connect/secrets/secrets-update';

export const Route = createFileRoute('/rp-connect/secrets/$secretId/edit')({
  staticData: {
    title: 'Edit Connector Secret',
  },
  component: SecretEditWrapper,
});

function SecretEditWrapper() {
  const { secretId } = useParams({ from: '/rp-connect/secrets/$secretId/edit' });
  return <RpConnectSecretUpdate matchedPath={`/rp-connect/secrets/${secretId}/edit`} secretId={secretId} />;
}
