/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import '@xyflow/react/dist/base.css';
import '@xyflow/react/dist/style.css';

/* start global stylesheets */
import './globals.scss';
import './index.scss';
import './index-cloud-integration.scss';
import './assets/fonts/open-sans.css';
import './assets/fonts/poppins.css';
import './assets/fonts/quicksand.css';
import './assets/fonts/kumbh-sans.css';
import './assets/fonts/inter.css';
/* end global styles */

/* start tailwind styles */
import './globals.css';

/* end tailwind styles */

import { Content } from '@builder.io/sdk-react';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { builderCustomComponents } from 'components/builder-io/builder-custom-components';
import { BUILDER_API_KEY } from 'components/constants';
import { CustomFeatureFlagProvider } from 'custom-feature-flag-provider';
import useDeveloperView from 'hooks/use-developer-view';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import queryClient from 'query-client';
import { getBasePath } from 'utils/env';

import { NotFoundPage } from './components/misc/not-found-page';
import { addBearerTokenInterceptor, checkExpiredLicenseInterceptor, getGrpcBasePath, setup } from './config';
import { routeTree } from './routeTree.gen';

// Create router instance
const router = createRouter({
  routeTree,
  context: {
    basePath: getBasePath(),
    queryClient,
  },
  basepath: getBasePath(),
  trailingSlash: 'never',
  defaultNotFoundComponent: NotFoundPage,
});

// Register router for type safety
declare module '@tanstack/react-router' {
  // biome-ignore lint/style/useConsistentTypeDefinitions: Required for TanStack Router module augmentation
  interface Register {
    router: typeof router;
  }

  // biome-ignore lint/style/useConsistentTypeDefinitions: Required for TanStack Router module augmentation
  interface HistoryState {
    // Knowledge base document details state
    chunkId?: string;
    topic?: string;
    documentName?: string;
    content?: string;
    score?: number;
  }
}

const App = () => {
  const developerView = useDeveloperView();
  setup({});

  const dataplaneTransport = createConnectTransport({
    baseUrl: getGrpcBasePath(''), // Embedded mode handles the path separately.
    interceptors: [addBearerTokenInterceptor, checkExpiredLicenseInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });

  // Need to use CustomFeatureFlagProvider for completeness with EmbeddedApp
  return (
    <CustomFeatureFlagProvider initialFlags={{}}>
      <Content apiKey={BUILDER_API_KEY} content={null} customComponents={builderCustomComponents} model={''} />
      <ChakraProvider resetCSS={false} theme={redpandaTheme} toastOptions={redpandaToastOptions}>
        <TransportProvider transport={dataplaneTransport}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <ReactQueryDevtools initialIsOpen={process.env.NODE_ENV !== 'production' && developerView} />
          </QueryClientProvider>
        </TransportProvider>
      </ChakraProvider>
    </CustomFeatureFlagProvider>
  );
};

export default observer(App);
