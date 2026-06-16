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
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
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
import RequireAuth from '../components/require-auth';
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
  // Mirrors __root.tsx's EmbeddedLayout so the embedded experience matches
  // production: AppPageHeader renders the page title (it already suppresses
  // the breadcrumb/sidebar-trigger in embedded mode — the host supplies those).
  return (
    <div id="mainLayout">
      <NullFallbackBoundary>
        <LicenseNotification />
      </NullFallbackBoundary>
      <ModalContainer />
      <AppPageHeader />

      <ErrorDisplay>
        <Outlet />
      </ErrorDisplay>

      <AppFooter />

      <ErrorModalsRenderer />
    </div>
  );
}
