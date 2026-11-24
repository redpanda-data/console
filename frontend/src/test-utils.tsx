import type { Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
// Copyright 2026 Redpanda Data, Inc.

import { createConnectTransport } from '@connectrpc/connect-web';
import { QueryClient, type QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type RenderOptions, render } from '@testing-library/react';
import React, { type JSXElementConstructor, type PropsWithChildren, type ReactElement, useState } from 'react';

import { TooltipProvider } from './components/redpanda-ui/components/tooltip';
import type { RouterContext } from './routes/__root';
import { routeTree } from './routeTree.gen';
import { trackedQueryClients, trackedRouters } from '../tests/harness-cleanup';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  transport?: Transport;
}

export { cleanupTestHarness } from '../tests/harness-cleanup';

const customRender = (ui: React.ReactElement, { ...renderOptions }: ExtendedRenderOptions = {}) =>
  render(ui, { wrapper: renderTransportQueryProviders.bind(null, renderOptions), ...renderOptions });

interface RenderWithFileRoutesOptions extends ExtendedRenderOptions {
  initialLocation?: string;
  routerContext?: Partial<RouterContext>;
}

export function renderWithFileRoutes(
  ui: ReactElement | null = null,
  { initialLocation = '/', routerContext = {}, ...renderOptions }: RenderWithFileRoutesOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  trackedQueryClients.add(queryClient);

  const finalTransport =
    renderOptions.transport ??
    createConnectTransport({
      baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
    });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    context: { basePath: '', queryClient, dataplaneTransport: finalTransport, ...routerContext },
  });
  trackedRouters.add(router);

  const wrapper = FileRouteProviders.bind(null, { transport: finalTransport, queryClient, router });

  const rendered = ui ? render(ui, { wrapper, ...renderOptions }) : render(<div />, { wrapper, ...renderOptions });

  return {
    ...rendered,
    router,
  };
}

/**
 * Render and navigate to a specific route for testing file-based routes.
 * Routes render automatically via RouterProvider based on the route tree.
 */
export async function renderRoute(location: string, options?: Omit<RenderWithFileRoutesOptions, 'initialLocation'>) {
  const result = renderWithFileRoutes(null, { initialLocation: location, ...options });
  await result.router.load();
  return result;
}

/**
 * Wait for the router to finish loading.
 * Use this after renderWithFileRoutes when you need to wait for route data to load.
 */
export async function waitForRouter(router: ReturnType<typeof createRouter>) {
  await router.load();
}

export function createTestRouterFromFiles(initialLocation = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
  trackedQueryClients.add(queryClient);

  const transport = createConnectTransport({
    baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    context: { basePath: '', queryClient, dataplaneTransport: transport },
  });
  trackedRouters.add(router);

  return router;
}

interface RenderWithRouterOptions extends ExtendedRenderOptions {
  initialLocation?: string;
  route?: string;
}

const renderWithRouter = (ui: ReactElement, renderOptions: RenderWithRouterOptions = {}) =>
  renderWithFileRoutes(ui, {
    initialLocation: renderOptions.initialLocation || renderOptions.route || '/',
    ...renderOptions,
  });

const connectQueryWrapper = (
  config?: QueryClientConfig,
  transport = createConnectTransport({
    baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
  })
): {
  wrapper: JSXElementConstructor<PropsWithChildren>;
  queryClient: QueryClient;
  transport: Transport;
  queryClientWrapper: JSXElementConstructor<PropsWithChildren>;
} => {
  const queryClient = new QueryClient(config);
  trackedQueryClients.add(queryClient);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { basePath: '', queryClient, dataplaneTransport: transport },
  });
  trackedRouters.add(router);

  return {
    wrapper: ({ children }) => (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <RouterContextProvider router={router}>{children}</RouterContextProvider>
        </QueryClientProvider>
      </TransportProvider>
    ),
    queryClient,
    transport,
    queryClientWrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  };
};

// biome-ignore lint/performance/noBarrelFile: Test utilities intentionally re-export for convenience
export * from '@testing-library/react';

export { connectQueryWrapper, customRender as render, renderWithRouter };

function TransportQueryProviders({
  renderOptions,
  children,
}: PropsWithChildren<{ renderOptions: ExtendedRenderOptions }>) {
  const finalTransport =
    renderOptions.transport ??
    createConnectTransport({
      baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
    });

  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0, // Immediately garbage collect query caches (prevents memory accumulation across tests)
          staleTime: 0, // Mark data stale immediately (ensures fresh data per test)
        },
        mutations: {
          retry: false,
        },
      },
    });
    trackedQueryClients.add(client);
    return client;
  });

  return (
    <TransportProvider transport={finalTransport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

function renderTransportQueryProviders(renderOptions: ExtendedRenderOptions, { children }: PropsWithChildren) {
  return <TransportQueryProviders renderOptions={renderOptions}>{children}</TransportQueryProviders>;
}

function FileRouteProviders(
  {
    transport: finalTransport,
    queryClient,
    router,
  }: { transport: Transport; queryClient: QueryClient; router: ReturnType<typeof createTestRouterFromFiles> },
  { children }: PropsWithChildren
) {
  return (
    <TransportProvider transport={finalTransport}>
      <QueryClientProvider client={queryClient}>
        <RouterContextProvider router={router}>
          <TooltipProvider>{children}</TooltipProvider>
        </RouterContextProvider>
      </QueryClientProvider>
    </TransportProvider>
  );
}
