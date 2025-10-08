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
import { StagewiseToolbar, type ToolbarConfig } from '@stagewise/toolbar-react';
import { ReactPlugin } from '@stagewise-plugins/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import AnnouncementBar from 'components/builder-io/AnnouncementBar';
import { builderCustomComponents } from 'components/builder-io/builderCustomComponents';
import { BUILDER_API_KEY } from 'components/constants';
import { CustomFeatureFlagProvider } from 'custom-feature-flag-provider';
import useDeveloperView from 'hooks/use-developer-view';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import { BrowserRouter } from 'react-router-dom';
import { getBasePath } from 'utils/env';

import AppContent from './components/layout/Content';
import { ErrorBoundary } from './components/misc/ErrorBoundary';
import HistorySetter from './components/misc/HistorySetter';
import { UserProfile } from './components/misc/UserButton';
import RequireAuth from './components/RequireAuth';
import { APP_ROUTES, createVisibleSidebarItems } from './components/routes';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  isEmbedded,
  setup,
} from './config';
import { uiSettings } from './state/ui';
import queryClient from 'queryClient';

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

  const transport = createConnectTransport({
    baseUrl: getGrpcBasePath(''), // Embedded mode handles the path separately.
    interceptors: [addBearerTokenInterceptor, checkExpiredLicenseInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });

  const stagewiseConfig: ToolbarConfig = { plugins: [ReactPlugin] };

  // Need to use CustomFeatureFlagProvider for completeness with EmbeddedApp
  return (
    <CustomFeatureFlagProvider initialFlags={{}}>
      <Content apiKey={BUILDER_API_KEY} content={null} customComponents={builderCustomComponents} model={''} />
      <BrowserRouter basename={getBasePath()}>
        <HistorySetter />
        <ChakraProvider resetCSS={false} theme={redpandaTheme} toastOptions={redpandaToastOptions}>
          <TransportProvider transport={transport}>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <RequireAuth>
                  {isEmbedded() ? (
                    <AppContent />
                  ) : (
                    <>
                      <AnnouncementBar />
                      <Grid minH="100vh" templateColumns="auto 1fr">
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
              <StagewiseToolbar
                config={stagewiseConfig}
                enabled={process.env.NODE_ENV === 'development' && developerView}
              />
            </QueryClientProvider>
          </TransportProvider>
        </ChakraProvider>
      </BrowserRouter>
    </CustomFeatureFlagProvider>
  );
};

export default observer(App);
