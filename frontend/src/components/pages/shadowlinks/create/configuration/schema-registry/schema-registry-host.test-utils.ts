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

import { createRouterTransport } from '@connectrpc/connect';
import { onTestFinished } from '@rstest/core';
import { config } from 'config';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';

export function setSchemaRegistryHost(jwt: string | undefined) {
  const previousJwt = config.jwt;
  config.jwt = jwt;
  onTestFinished(() => {
    config.jwt = previousJwt;
  });
}

export function serveSecretNames(...names: string[]) {
  return createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () => ({ response: { secrets: names.map((id) => ({ id })) } }));
  });
}
