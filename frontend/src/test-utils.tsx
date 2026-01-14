import type { Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { QueryClient, type QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type RenderOptions, render } from '@testing-library/react';
import React, { type JSXElementConstructor, type PropsWithChildren, type ReactElement, useState } from 'react';

import type { RouterContext } from './routes/__root';
import { routeTree } from './routeTree.gen';

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  transport?: Transport;
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
    const [queryClient] = useState(
      () =>
        new QueryClient({
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
        })
    );

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
      },
    },
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    context: { basePath: '', queryClient, ...routerContext },
  });

  function Wrapper({ children }: PropsWithChildren): JSX.Element {
    const finalTransport =
      renderOptions.transport ??
      createConnectTransport({
        baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
      });

    return (
      <TransportProvider transport={finalTransport}>
        <QueryClientProvider client={queryClient}>
          <ChakraProvider theme={redpandaTheme}>
            <RouterContextProvider router={router}>{children}</RouterContextProvider>
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
      },
    },
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    context: { basePath: '', queryClient },
  });

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
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { basePath: '', queryClient },
  });

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
