/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Container, Grid } from '@redpanda-data/ui';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import AnnouncementBar from 'components/builder-io/announcement-bar';
import { Toaster } from 'components/redpanda-ui/components/sonner';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { isEmbedded } from 'config';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { BrowserRouter } from 'react-router-dom';
import { getBasePath } from 'utils/env';

import AppFooter from '../components/layout/footer';
import AppPageHeader from '../components/layout/header';
import { AppSidebarLegacy } from '../components/layout/sidebar-legacy';
import { SidebarLayout } from '../components/layout/sidebar-new';
import { LicenseNotification } from '../components/license/license-notification';
import { ErrorBoundary } from '../components/misc/error-boundary';
import { ErrorDisplay } from '../components/misc/error-display';
import { renderErrorModals } from '../components/misc/error-modal';
import { NullFallbackBoundary } from '../components/misc/null-fallback-boundary';
import { RouterSync } from '../components/misc/router-sync';
import { SidebarInset } from '../components/redpanda-ui/components/sidebar';
import RequireAuth from '../components/require-auth';
import { ModalContainer } from '../utils/modal-container';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

/**
 * RootLayout wraps the app with both TanStack Router (primary) and BrowserRouter (compatibility).
 * BrowserRouter provides context for legacy React Router hooks during migration.
 * TODO: Remove BrowserRouter once all components are migrated to TanStack Router.
 */
function RootLayout() {
  return (
    <>
      <RouterSync />
      <BrowserRouter basename={getBasePath()}>
        <NuqsAdapter>
          <ErrorBoundary>
            <RequireAuth>{isEmbedded() ? <EmbeddedLayout /> : <SelfHostedLayout />}</RequireAuth>
          </ErrorBoundary>
        </NuqsAdapter>
      </BrowserRouter>
      {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools position="bottom-right" />}
    </>
  );
}

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

function EmbeddedLayout() {
  return <AppContent />;
}

function AppContent() {
  return (
    <div id="mainLayout">
      <TooltipProvider>
        {/* Page */}
        <NullFallbackBoundary>
          <LicenseNotification />
        </NullFallbackBoundary>
        <ModalContainer />
        <AppPageHeader />

        <ErrorDisplay>
          <Outlet />
        </ErrorDisplay>

        <AppFooter />

        {/* Currently disabled, read todo comment on UpdatePopup */}
        {/* <UpdatePopup /> */}
        {renderErrorModals()}

        {/* Toaster for notifications */}
        <Toaster />
      </TooltipProvider>
    </div>
  );
}
