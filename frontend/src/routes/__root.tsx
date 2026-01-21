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

import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import AnnouncementBar from 'components/builder-io/announcement-bar';
import { Toaster } from 'components/redpanda-ui/components/sonner';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { isEmbedded } from 'config';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import AppFooter from '../components/layout/footer';
import AppPageHeader from '../components/layout/header';
import { SidebarLayout } from '../components/layout/sidebar';
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

function RootLayout() {
  return (
    <>
      <RouterSync />
      <NuqsAdapter>
        <ErrorBoundary>
          <RequireAuth>{isEmbedded() ? <EmbeddedLayout /> : <SelfHostedLayout />}</RequireAuth>
        </ErrorBoundary>
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools position="bottom-right" />}
    </>
  );
}

function SelfHostedLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname.startsWith('/login');

  if (isLoginPage) {
    return <Outlet />;
  }

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
