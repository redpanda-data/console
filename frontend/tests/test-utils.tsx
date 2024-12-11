import type { Transport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React, { type PropsWithChildren, type ReactElement } from 'react';
import { Router } from 'react-router-dom';

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

const renderWithRouter = (
  ui: ReactElement,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    ...renderOptions
  }: RenderWithRouterOptions = {},
) => {
  return {
    ...customRender(<Router history={history}>{ui}</Router>, renderOptions),
    history,
  };
};

// override render method
export { renderWithRouter, customRender as render, connectQueryWrapper };
