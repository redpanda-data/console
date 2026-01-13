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
import { ChakraProvider, Container, Grid, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import AnnouncementBar from 'components/builder-io/announcement-bar';
import { builderCustomComponents } from 'components/builder-io/builder-custom-components';
import { BUILDER_API_KEY } from 'components/constants';
import { CustomFeatureFlagProvider } from 'custom-feature-flag-provider';
import useDeveloperView from 'hooks/use-developer-view';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import queryClient from 'query-client';
import { BrowserRouter } from 'react-router-dom';
import { getBasePath } from 'utils/env';

import AppContent from './components/layout/content';
import { AppSidebarLegacy } from './components/layout/sidebar-legacy';
import { SidebarLayout } from './components/layout/sidebar-new';
import { ErrorBoundary } from './components/misc/error-boundary';
import HistorySetter from './components/misc/history-setter';
import { SidebarInset } from './components/redpanda-ui/components/sidebar';
import RequireAuth from './components/require-auth';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  isEmbedded,
  setup,
} from './config';

function SelfHostedLayout() {
  // It's self-hosted so it won't have access to the outside world to check the feature flag.
  const useNewSidebar = true;

  if (useNewSidebar) {
    return (
      <>
        <AnnouncementBar />
        <SidebarLayout>
          <SidebarInset>
            <div className="container mx-auto max-w-[1500px] px-12 pt-8">
              <AppContent />
            </div>
          </SidebarInset>
        </SidebarLayout>
      </>
    );
  }

  return (
    <>
      <AnnouncementBar />
      <Grid minH="100vh" templateColumns="auto 1fr">
        <AppSidebarLegacy />
        <Container as="main" maxWidth="1500px" pt="8" px="12" width="full">
          <AppContent />
        </Container>
      </Grid>
    </>
  );
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
      <BrowserRouter basename={getBasePath()}>
        <HistorySetter />
        <ChakraProvider resetCSS={false} theme={redpandaTheme} toastOptions={redpandaToastOptions}>
          <TransportProvider transport={dataplaneTransport}>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <RequireAuth>{isEmbedded() ? <AppContent /> : <SelfHostedLayout />}</RequireAuth>
              </ErrorBoundary>
              <ReactQueryDevtools initialIsOpen={process.env.NODE_ENV !== 'production' && developerView} />
            </QueryClientProvider>
          </TransportProvider>
        </ChakraProvider>
      </BrowserRouter>
    </CustomFeatureFlagProvider>
  );
};

export default observer(App);
