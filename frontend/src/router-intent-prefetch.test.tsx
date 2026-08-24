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

import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { routerDefaults } from './router-defaults';
import { prefetchTopicsRouteData } from './routes/topics/-loader';

vi.mock('sonner', () => ({ toast: {} }));

it('starts the Topics query on link intent without navigating', async () => {
  const queryClient = new QueryClient();
  const prefetchQuery = vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue();
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (
      <>
        <Link to="/topics">Topics</Link>
        <Outlet />
      </>
    ),
  });
  const topicsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/topics',
    loader: ({ context }) => prefetchTopicsRouteData(context.queryClient),
    component: () => <h1>Topics page</h1>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const router = createRouter({
    ...routerDefaults,
    context: { queryClient },
    defaultPreloadStaleTime: 0,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([indexRoute, topicsRoute]),
  });
  await router.load();
  render(<RouterProvider router={router} />);

  await userEvent.setup().hover(screen.getByRole('link', { name: 'Topics' }));

  await waitFor(() => expect(prefetchQuery).toHaveBeenCalledOnce());
  expect(router.state.location.pathname).toBe('/');
  expect(screen.getByRole('link', { name: 'Topics' })).toBeVisible();
});
