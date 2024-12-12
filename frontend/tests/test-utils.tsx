import type { Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { QueryClient, type QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import React, { type JSXElementConstructor, type PropsWithChildren, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

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
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
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

interface RenderWithRouterOptions extends ExtendedRenderOptions {
  route?: string;
}

const renderWithRouter = (ui: ReactElement, renderOptions: RenderWithRouterOptions = {}) => {
  return {
    ...customRender(<MemoryRouter>{ui}</MemoryRouter>, renderOptions),
  };
};

const connectQueryWrapper = (
  config?: QueryClientConfig,
  transport = createConnectTransport({
    baseUrl: process.env.REACT_APP_PUBLIC_API_URL ?? '',
  }),
): {
  wrapper: JSXElementConstructor<PropsWithChildren>;
  queryClient: QueryClient;
  transport: Transport;
  queryClientWrapper: JSXElementConstructor<PropsWithChildren>;
} => {
  const queryClient = new QueryClient(config);

  return {
    wrapper: ({ children }) => (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TransportProvider>
    ),
    queryClient,
    transport,
    queryClientWrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  };
};

// override render method
export { renderWithRouter, customRender as render, connectQueryWrapper };
