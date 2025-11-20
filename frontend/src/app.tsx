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
import { ChakraProvider, Container, Grid, redpandaTheme, redpandaToastOptions, Sidebar } from '@redpanda-data/ui';
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
import { ErrorBoundary } from './components/misc/error-boundary';
import HistorySetter from './components/misc/history-setter';
import { UserProfile } from './components/misc/user-button';
import RequireAuth from './components/require-auth';
import { APP_ROUTES, createVisibleSidebarItems } from './components/routes';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  isEmbedded,
  setup,
} from './config';
import { uiSettings } from './state/ui';

const AppSidebar = observer(() => {
  const sidebarItems = createVisibleSidebarItems(APP_ROUTES);

  return (
    <Sidebar isCollapsed={!uiSettings.sideBarOpen} items={sidebarItems}>
      <UserProfile />
    </Sidebar>
  );
});

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
                <RequireAuth>
                  {isEmbedded() ? (
                    <AppContent />
                  ) : (
                    <>
                      <AnnouncementBar />
                      <Grid h="100vh" templateColumns="auto 1fr">
                        <AppSidebar />
                        <Container as="main" maxWidth="1500px" pt="8" px="12" width="full">
                          <AppContent />
                        </Container>
                      </Grid>
                    </>
                  )}
                </RequireAuth>
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
