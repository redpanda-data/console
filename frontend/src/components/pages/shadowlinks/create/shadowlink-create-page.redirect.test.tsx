/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, expect, test } from '@rstest/core';
import { cleanup, waitFor } from '@testing-library/react';
import { ListShadowLinksResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';

const browserHost = window as Window & { BASE_URL?: string };
const originalBase = Object.getOwnPropertyDescriptor(browserHost, 'BASE_URL');
const originalLocation = window.location.href;

beforeEach(() => {
  browserHost.BASE_URL = '/console/';
  window.history.replaceState({}, '', '/clusters/abc/shadowlinks/create');
});

afterEach(() => {
  if (originalBase) {
    Object.defineProperty(browserHost, 'BASE_URL', originalBase);
  } else {
    Reflect.deleteProperty(browserHost, 'BASE_URL');
  }
  window.history.replaceState({}, '', originalLocation);
});

test('the embedded create page redirects to the standalone path under the configured base', async () => {
  const [{ config }, { renderWithFileRoutes }, { ShadowLinkCreatePage }] = await Promise.all([
    import('config'),
    import('test-utils'),
    import('./shadowlink-create-page'),
  ]);
  const originalJWT = config.jwt;
  config.jwt = 'embedded-test-token';

  try {
    renderWithFileRoutes(<ShadowLinkCreatePage />, {
      initialLocation: '/shadowlinks/create',
      transport: createRouterTransport(({ rpc }) => {
        rpc(listShadowLinks, () => create(ListShadowLinksResponseSchema, { shadowLinks: [] }));
      }),
    });
    await waitFor(() => expect(window.location.pathname).toBe('/console/shadowlinks/create'));
  } finally {
    cleanup();
    config.jwt = originalJWT;
  }
});
