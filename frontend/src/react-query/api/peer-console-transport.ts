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

import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor } from 'config';
import { protobufRegistry } from 'protobuf-registry';

const transports = new Map<string, Transport>();

/**
 * Each cluster's Console serves its own cluster fence API, at the URL Cloud lists for it. Calls carry
 * the same token as this Console's own, so the other cluster checks the viewer's own permissions.
 */
export const peerConsoleTransport = (consoleUrl: string): Transport => {
  let transport = transports.get(consoleUrl);
  if (!transport) {
    transport = createConnectTransport({
      baseUrl: consoleUrl,
      interceptors: [addBearerTokenInterceptor],
      jsonOptions: { registry: protobufRegistry },
    });
    transports.set(consoleUrl, transport);
  }
  return transport;
};
