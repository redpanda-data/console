import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { addBearerTokenInterceptor, config, isEmbedded } from 'config';
import { protobufRegistry } from 'protobuf-registry';
import { useMemo } from 'react';

/**
 * Transport for the new AI Gateway (aigw v2) management API.
 * Uses config.aigwUrl from cluster.aiGateway.v2Url.
 *
 * In Development:
 *   - Uses base path: /.aigw/api
 *   - Dev server proxies to the aigw v2 management endpoint
 *
 * In Production (Embedded):
 *   - Uses config.aigwUrl set by cloud-ui parent app
 *
 * In Production (Standalone):
 *   - Uses relative path /.aigw/api (backend handles routing)
 */
// Use the binary (proto) wire format instead of JSON. MCPServer responses contain
// `google.protobuf.Any` fields (backend.managed.config) whose inner types live in
// the redpanda-data/mcps library and are not in the console's protobuf registry.
// `anyFromJson` throws for any unregistered `@type`, so JSON decoding fails on the
// entire response. Binary Any keeps the inner bytes opaque — no registry needed.
// `ignoreUnknownFields` covers forward-compat for plain fields added server-side
// before the console regenerates bindings.
const AIGW_JSON_OPTIONS = { registry: protobufRegistry, ignoreUnknownFields: true };

export const useAigwTransport = (): Transport => {
  return useMemo(() => {
    // In embedded mode (cloud-ui), use the aigw URL from parent config.
    // This must be checked first — even in dev builds, isEmbedded() is true
    // when loaded as MFE, and relative paths would resolve against cloud-ui's origin.
    if (isEmbedded() && config.aigwUrl) {
      return createConnectTransport({
        baseUrl: config.aigwUrl,
        interceptors: [addBearerTokenInterceptor],
        useBinaryFormat: true,
        jsonOptions: AIGW_JSON_OPTIONS,
      });
    }

    // Standalone dev/prod — relies on dev server proxy or backend routing.
    return createConnectTransport({
      baseUrl: '/.aigw/api',
      interceptors: [addBearerTokenInterceptor],
      useBinaryFormat: true,
      jsonOptions: AIGW_JSON_OPTIONS,
    });
  }, []);
};
