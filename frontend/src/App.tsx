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

import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { Container, Grid, Sidebar, redpandaToastOptions } from '@redpanda-data/ui';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { CustomFeatureFlagProvider, useBooleanFlagValue } from 'custom-feature-flag-provider';
import useDeveloperView from 'hooks/use-developer-view';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import queryClient from 'queryClient';
import { BrowserRouter } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import AppContent from './components/layout/Content';
import { ErrorBoundary } from './components/misc/ErrorBoundary';
import HistorySetter from './components/misc/HistorySetter';
import { UserProfile } from './components/misc/UserButton';
import { createVisibleSidebarItems } from './components/routes';
import { APP_ROUTES } from './components/routes';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  isEmbedded,
  setup,
} from './config';
import { uiSettings } from './state/ui';
import { getBasePath } from './utils/env';

// Stagewise (AI)
import { ReactPlugin } from '@stagewise-plugins/react';
import { StagewiseToolbar, type ToolbarConfig } from '@stagewise/toolbar-react';

const AppSidebar = observer(() => {
  const isAiAgentsEnabled = useBooleanFlagValue('enableAiAgentsInConsoleUi');

  const APP_ROUTES_WITHOUT_AI_AGENTS = APP_ROUTES.filter((route) => !route.path.startsWith('/agents'));
  const FINAL_APP_ROUTES = isAiAgentsEnabled ? APP_ROUTES : APP_ROUTES_WITHOUT_AI_AGENTS;

  const sidebarItems = createVisibleSidebarItems(FINAL_APP_ROUTES);

  return (
    <Sidebar items={sidebarItems} isCollapsed={!uiSettings.sideBarOpen}>
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
      <BrowserRouter basename={getBasePath()}>
        <HistorySetter />
        <ChakraProvider theme={redpandaTheme} toastOptions={redpandaToastOptions} resetCSS={false}>
          <TransportProvider transport={transport}>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <RequireAuth>
                  {isEmbedded() ? (
                    <AppContent />
                  ) : (
                    <Grid templateColumns="auto 1fr" minH="100vh">
                      <AppSidebar />
                      <Container width="full" maxWidth="1500px" as="main" pt="8" px="12">
                        <AppContent />
                      </Container>
                    </Grid>
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
