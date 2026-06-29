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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { QueryClient } from '@tanstack/react-query';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { Route } from 'routes/shadowlinks/index';
import { describe, expect, test } from 'vitest';

// A transport whose listShadowLinks RPC always fails with the given code, so we
// can drive the route loader's error handling.
const failingTransport = (code: Code, message: string) =>
  createRouterTransport(({ rpc }) => {
    rpc(listShadowLinks, () => {
      throw new ConnectError(message, code);
    });
  });

const runLoader = (code: Code, message: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // biome-ignore lint/suspicious/noExplicitAny: the loader only reads queryClient + dataplaneTransport off context.
  return (Route.options.loader as any)({
    context: { queryClient, dataplaneTransport: failingTransport(code, message) },
  });
};

describe('shadowlinks route loader', () => {
  // The bug: the loader rethrew everything except FailedPrecondition/Unavailable,
  // so a permission_denied failed the whole route and the page never rendered.
  test('swallows PermissionDenied so the page can render its no-permission state', async () => {
    await expect(
      runLoader(Code.PermissionDenied, 'you are not authorized to call this endpoint')
    ).resolves.toBeUndefined();
  });

  test('swallows FailedPrecondition (feature disabled) and Unavailable (admin API down)', async () => {
    await expect(runLoader(Code.FailedPrecondition, 'Cluster link feature is disabled')).resolves.toBeUndefined();
    await expect(runLoader(Code.Unavailable, 'admin api unavailable')).resolves.toBeUndefined();
  });

  test('still rethrows unexpected errors (so the router error boundary is shown)', async () => {
    await expect(runLoader(Code.Internal, 'boom')).rejects.toThrow('boom');
  });
});
