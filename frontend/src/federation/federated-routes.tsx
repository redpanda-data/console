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
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import { DebugHelper } from '../components/debug-helper/debug-dialog';
import AppFooter from '../components/layout/footer';
import AppPageHeader from '../components/layout/header';
import { LicenseNotification } from '../components/license/license-notification';
import { ErrorBoundary } from '../components/misc/error-boundary';
import { ErrorDisplay } from '../components/misc/error-display';
import { ErrorModalsRenderer } from '../components/misc/error-modal';
import { NullFallbackBoundary } from '../components/misc/null-fallback-boundary';
import { RouterSync } from '../components/misc/router-sync';
import { Toaster } from '../components/redpanda-ui/components/sonner';
import RequireAuth from '../components/require-auth';
import { useIsDarkMode } from '../hooks/use-is-dark-mode';
import { useFullscreenPageStore } from '../state/fullscreen-page-store';
import { isFullscreenPath } from '../utils/fullscreen-routes';
import { ModalContainer } from '../utils/modal-container';

/**
 * Builder.io components are excluded from federated routes.
 * In embedded/federated mode, we don't load Builder.io content to:
 * 1. Reduce bundle size for the federated module
 * 2. Avoid unnecessary network requests to Builder.io
 * 3. Keep the embedded experience focused on core functionality
 *
 * These null components are used as drop-in replacements when
 * Builder.io components would otherwise be imported.
 */
export const NurturePanel = () => null;
export const AnnouncementBar = () => null;

/**
 * Router context for federated routes.
 * Matches the context type from __root.tsx for compatibility.
 */
export type FederatedRouterContext = {
  basePath: string;
  queryClient: QueryClient;
  dataplaneTransport: Transport;
};

/**
 * Root route for federated Console app.
 * Minimal layout without sidebar (host provides sidebar navigation).
 */
export const federatedRootRoute = createRootRouteWithContext<FederatedRouterContext>()({
  component: FederatedRootLayout,
});

/**
 * Federated root layout component.
 * Renders content without sidebar - host application provides navigation.
 */
function FederatedRootLayout() {
  return (
    <>
      <RouterSync />
      <NuqsAdapter>
        <ErrorBoundary>
          {/* RequireAuth triggers the user-data fetch (api.refreshUserData) that
              gates Console's endpoint-compatibility fetch and, in turn, the
              embedded sidebar items. The standalone root (__root.tsx) wraps its
              embedded layout the same way. */}
          <RequireAuth>
            <FederatedAppContent />
          </RequireAuth>
        </ErrorBoundary>
        {/* Cmd+Shift+D debug dialog — mirrors __root.tsx; dev-only. */}
        {process.env.NODE_ENV === 'development' && <DebugHelper />}
      </NuqsAdapter>
    </>
  );
}

/**
 * App content for federated mode.
 * Similar to EmbeddedLayout from __root.tsx but optimized for MF v2.0.
 */
function FederatedAppContent() {
  const matches = useMatches();
  const { pathname } = useLocation();
  // Fullscreen routes (SQL studio) own their chrome — breadcrumb-only header, no
  // padding/footer. staticData is the source of truth, but on soft navigation
  // useMatches() lags useLocation() by a render or two (matches resolve after
  // pathname flips), so fall back to a path check to avoid flashing full chrome on
  // the way in. Single return with stable element positions: toggling props/classes
  // (not branching the tree) keeps the <Outlet> mounted across fullscreen↔normal
  // navigation, so the embedded router doesn't reset to its default route.
  // Static route metadata covers always-fullscreen routes (SQL); the runtime store covers pages
  // toggled full-screen at runtime (the RPCN editor's full mode), which strip chrome + footer so the
  // pinned overlay doesn't collide with a floating footer. Boxed mode leaves it false → footer below.
  const fullscreenPageActive = useFullscreenPageStore((s) => s.active);
  const isFullscreen = matches.some((m) => m.staticData.fullscreen) || isFullscreenPath(pathname) || fullscreenPageActive;
  const toasterTheme = useIsDarkMode() ? 'dark' : 'light';

  return (
    <div id="mainLayout">
      {!isFullscreen && (
        <NullFallbackBoundary>
          <LicenseNotification />
        </NullFallbackBoundary>
      )}
      <ModalContainer />
      <AppPageHeader breadcrumbOnly={isFullscreen} />

      <ErrorDisplay>
        <div className={isFullscreen ? undefined : 'pt-8'}>
          <Outlet />
        </div>
      </ErrorDisplay>

      {!isFullscreen && <AppFooter />}

      <ErrorModalsRenderer />

      {/* sonner isn't an MF-shared singleton, so the host's <Toaster> can't
          surface Console's toasts; mirror __root.tsx's AppContent. */}
      <Toaster position="top-right" richColors theme={toasterTheme} />
    </div>
  );
}
