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
import { Container, Grid, Sidebar, redpandaToastOptions } from '@redpanda-data/ui';
import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { BrowserRouter } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import AppContent from './components/layout/Content';
import { ErrorBoundary } from './components/misc/ErrorBoundary';
import HistorySetter from './components/misc/HistorySetter';
import { UserProfile } from './components/misc/UserButton';
import { createVisibleSidebarItems } from './components/routes';
import { APP_ROUTES } from './components/routes';
import { isEmbedded, setup } from './config';
import { uiSettings } from './state/ui';
import { getBasePath } from './utils/env';

const AppSidebar = observer(() => {
  const sidebarItems = createVisibleSidebarItems(APP_ROUTES);
  return (
    <Sidebar items={sidebarItems} isCollapsed={!uiSettings.sideBarOpen}>
      <UserProfile />
    </Sidebar>
  );
});

const App = () => {
  setup({});
  return (
    <BrowserRouter basename={getBasePath()}>
      <HistorySetter />
      <ChakraProvider theme={redpandaTheme} toastOptions={redpandaToastOptions}>
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
      </ChakraProvider>
    </BrowserRouter>
  );
};

export default observer(App);
