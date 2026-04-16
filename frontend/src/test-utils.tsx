import type { Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { QueryClient, type QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type RenderOptions, render } from '@testing-library/react';
import React, { type JSXElementConstructor, type PropsWithChildren, type ReactElement, useState } from 'react';

import { TooltipProvider } from './components/redpanda-ui/components/tooltip';
import type { RouterContext } from './routes/__root';
import { routeTree } from './routeTree.gen';

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  transport?: Transport;
}

// Track every QueryClient and router created by the test harness so
// `cleanupTestHarness` can tear them down after each test. A plain render +
// RTL cleanup only unmounts the React tree — the QueryClient and the
// TanStack router are still held alive by closures inside the test file
// (`const { router } = renderWithFileRoutes(...)`), so every test's fetched
// data, route matches, and history entries accumulate in the worker heap
// otherwise. That retention is the primary cause of the +100–240 MB
// intra-file heap growth measured during the TDD audit.
const trackedQueryClients = new Set<QueryClient>();

// The router generic graph is file-specific and routeTree-derived; we only
// ever touch `.history.destroy?.()` at teardown, so the minimal structural
// shape below is enough to keep the callers free of casts while still giving
// us type-safety on the one method we call.
type TrackedRouter = { history: { destroy?: () => void } };
const trackedRouters = new Set<TrackedRouter>();

/**
 * Clear and discard every tracked QueryClient and router. Intended to be
 * called from the global `afterEach` in `vitest.setup.integration.ts`.
 *
 * - `cancelQueries()` aborts in-flight fetches that might still resolve
 *   and mutate state after the test completes.
 * - `clear()` drops the cache map and observer list so fixtures the test
 *   fetched are eligible for GC.
 * - `unmount()` tears down the QueryClient's internal listeners.
 * - `history.destroy()` removes the memory-history listener set, allowing
 *   the router graph (matches, loaders, contexts referencing QueryClient)
 *   to become unreachable.
 */
export function cleanupTestHarness(): void {
  for (const client of trackedQueryClients) {
    client.cancelQueries();
    client.clear();
    client.unmount();
  }
  trackedQueryClients.clear();

  for (const router of trackedRouters) {
    router.history.destroy?.();
  }
  trackedRouters.clear();
}

const customRender = (ui: React.ReactElement, { ...renderOptions }: ExtendedRenderOptions = {}) => {
  function Wrapper({ children }: PropsWithChildren): JSX.Element {
    const finalTransport =
      renderOptions.transport ??
      createConnectTransport({
        baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
      });

    // Use useState to lazily initialize the QueryClient once and keep it stable across re-renders
    // This prevents the client from being recreated when the Wrapper re-renders
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
        <QueryClientProvider client={queryClient}>
          <ChakraProvider theme={redpandaTheme}>{children}</ChakraProvider>
        </QueryClientProvider>
      </TransportProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// File-based routing test utilities
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
        // gcTime + staleTime: 0 guarantees Connect Query caches are dropped
        // the moment their observers unmount (end of test), so tests that
        // render lists of fixtures don't retain those fixtures for the
        // duration of the file.
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

  function Wrapper({ children }: PropsWithChildren): JSX.Element {
    return (
      <TransportProvider transport={finalTransport}>
        <QueryClientProvider client={queryClient}>
          <ChakraProvider theme={redpandaTheme}>
            <RouterContextProvider router={router}>
              <TooltipProvider>{children}</TooltipProvider>
            </RouterContextProvider>
          </ChakraProvider>
        </QueryClientProvider>
      </TransportProvider>
    );
  }

  const rendered = ui
    ? render(ui, { wrapper: Wrapper, ...renderOptions })
    : render(<div />, { wrapper: Wrapper, ...renderOptions });

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

// Create test router with generated route tree
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

// Legacy router support - now uses file-based routing
interface RenderWithRouterOptions extends ExtendedRenderOptions {
  route?: string;
  initialLocation?: string;
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

// re-export everything
// biome-ignore lint/performance/noBarrelFile: Test utilities intentionally re-export for convenience
export * from '@testing-library/react';

// override render method
export { renderWithRouter, customRender as render, connectQueryWrapper };
