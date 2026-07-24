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

import type { Transport } from '@connectrpc/connect';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation, useMatches } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import AnnouncementBar from 'components/builder-io/announcement-bar';
import { Toaster } from 'components/redpanda-ui/components/sonner';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { isEmbedded } from 'config';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import { DebugHelper } from '../components/debug-helper/debug-helper';
import AppFooter from '../components/layout/footer';
import AppPageHeader from '../components/layout/header';
import { SidebarLayout } from '../components/layout/sidebar';
import { LicenseNotification } from '../components/license/license-notification';
import { ErrorBoundary } from '../components/misc/error-boundary';
import { ErrorDisplay } from '../components/misc/error-display';
import { ErrorModalsRenderer } from '../components/misc/error-modal';
import { NullFallbackBoundary } from '../components/misc/null-fallback-boundary';
import { RouterSync } from '../components/misc/router-sync';
import { SidebarInset } from '../components/redpanda-ui/components/sidebar';
import RequireAuth from '../components/require-auth';
import { useIsDarkMode } from '../hooks/use-is-dark-mode';
import { IsDev } from '../utils/env';
import { isFullscreenPath } from '../utils/fullscreen-routes';
import { ModalContainer } from '../utils/modal-container';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
  dataplaneTransport: Transport;
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
        {IsDev ? <DebugHelper /> : null}
      </NuqsAdapter>

      {IsDev ? <TanStackRouterDevtools position="bottom-right" /> : null}
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
          {/* px-12 gutter + max-width cap, released by data-page-expanded (index.scss). */}
          <div className="page-expanded-release container mx-auto flex max-w-[1500px] flex-1 flex-col px-12 transition-[max-width,padding] duration-300 ease-in-out">
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
  const matches = useMatches();
  const { pathname } = useLocation();
  const isFullscreen = matches.some((m) => m.staticData.fullscreen) || isFullscreenPath(pathname);
  const toasterTheme = useIsDarkMode() ? 'dark' : 'light';

  if (isFullscreen) {
    return (
      <div id="mainLayout">
        <TooltipProvider>
          <ModalContainer />
          {!isEmbedded() && <AppPageHeader breadcrumbOnly />}
          <ErrorDisplay>
            <Outlet />
          </ErrorDisplay>
          <ErrorModalsRenderer />
          <Toaster position="top-right" richColors theme={toasterTheme} />
        </TooltipProvider>
      </div>
    );
  }

  return (
    // Flex column + flex-1 so the footer's `margin-top: auto` pins it to the bottom.
    <div className="flex flex-1 flex-col" id="mainLayout">
      <TooltipProvider>
        {/* Page */}
        <NullFallbackBoundary>
          <LicenseNotification />
        </NullFallbackBoundary>
        <ModalContainer />
        <AppPageHeader />

        <ErrorDisplay>
          <div className="pt-8">
            <Outlet />
          </div>
        </ErrorDisplay>

        <AppFooter />

        {/* Currently disabled, read todo comment on UpdatePopup */}
        {/* <UpdatePopup /> */}
        <ErrorModalsRenderer />

        {/* Toaster for notifications */}
        <Toaster position="top-right" richColors theme={toasterTheme} />
      </TooltipProvider>
    </div>
  );
}
