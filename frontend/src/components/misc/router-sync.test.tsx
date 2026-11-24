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

import { expect, onTestFinished, test } from '@rstest/core';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import { config } from 'config';
import { useApiStore } from 'state/backend-api';

import { RouterSync } from './router-sync';

const NAVIGATED = '[console] navigated';

function recordNavigation() {
  const navigations: unknown[] = [];
  const receive = (event: Event) => {
    navigations.push(event instanceof CustomEvent ? event.detail : event.type);
  };
  window.addEventListener(NAVIGATED, receive);
  onTestFinished(() => window.removeEventListener(NAVIGATED, receive));
  return navigations;
}

function configureNavigationHost(jwt: string | undefined, clusterId: string | undefined) {
  const previous = { jwt: config.jwt, clusterId: config.clusterId };
  const { errors } = useApiStore.getState();
  Object.assign(config, { jwt, clusterId });
  onTestFinished(() => {
    Object.assign(config, previous);
    useApiStore.setState({ errors });
  });
}

async function renderNavigation(jwt: string | undefined, clusterId: string | undefined) {
  configureNavigationHost(jwt, clusterId);
  const root = createRootRoute({ component: RouterSync });
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/topics' }),
    createRoute({ getParentRoute: () => root, path: '/schema-registry' }),
  ]);
  const history = createMemoryHistory({ initialEntries: ['/topics'] });
  const router = createRouter({ routeTree, history });
  onTestFinished(() => history.destroy());
  render(<RouterProvider router={router} />);
  await act(async () => {
    await router.load();
  });
  return router;
}

test.each([
  { mode: 'standalone', jwt: undefined, clusterId: undefined, notifications: [] },
  { mode: 'federated', jwt: 'host-token', clusterId: 'cluster-123', notifications: [] },
  { mode: 'legacy embedded', jwt: 'host-token', clusterId: undefined, notifications: ['/topics', '/schema-registry'] },
])('only the legacy host receives window navigation events: $mode', async ({ jwt, clusterId, notifications }) => {
  const received = recordNavigation();
  const router = await renderNavigation(jwt, clusterId);

  await act(async () => {
    await router.navigate({ to: '/schema-registry' });
  });

  expect(router.state.location.pathname).toBe('/schema-registry');
  expect(received).toEqual(notifications);
});
