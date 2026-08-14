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
import { useLayoutEffect, useRef } from 'react';

import { DebugHelper } from '../components/debug-helper/debug-helper';
import AppFooter from '../components/layout/footer';
import AppPageHeader from '../components/layout/header';
import { PageColumn } from '../components/layout/page-column';
import { LicenseNotification } from '../components/license/license-notification';
import { ErrorBoundary } from '../components/misc/error-boundary';
import { ErrorDisplay } from '../components/misc/error-display';
import { ErrorModalsRenderer } from '../components/misc/error-modal';
import { NullFallbackBoundary } from '../components/misc/null-fallback-boundary';
import { RouterSync } from '../components/misc/router-sync';
import { Toaster } from '../components/redpanda-ui/components/sonner';
import RequireAuth from '../components/require-auth';
import { useIsDarkMode } from '../hooks/use-is-dark-mode';
import { chainToBody, documentTop } from '../utils/dom-position';
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
 * Fits `#mainLayout` into the host's shell. Neither half can be CSS: every wrapper
 * above it belongs to the host app, so there is no chain to inherit from.
 *
 * - Cancels the host's side/bottom padding with equal negative margins, leaving
 *   Console's own gutter as the only one. Measured, not hardcoded, so either project
 *   can deploy first. Top padding stays — cancelling it would pull Console under the
 *   host's header; pages size themselves off it instead (layout/page-column.tsx).
 * - Stretches the layout to the viewport bottom so the footer's `margin-top: auto`
 *   lands there instead of trailing short pages.
 *
 * Requires of the host (Cloud UI `common/layout/layout.tsx`): spacing as `padding`, since
 * margin, gap and `max-width` aren't cancellable here; no `overflow` on those ancestors,
 * which clips the negative margins; and its own `html[data-page-expanded]` `max-width`
 * release for expanded mode.
 */
const useHostShellFit = () => {
  const layoutRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layoutEl = layoutRef.current;
    if (!layoutEl) {
      return;
    }

    const hostWrappers = chainToBody(layoutEl.parentElement);

    // Both writes resize the wrappers being observed, so only write on change.
    let lastMargin = '';
    let lastMinHeight = '';
    const applyFit = () => {
      let left = 0;
      let right = 0;
      let bottom = 0;
      for (const el of hostWrappers) {
        const style = getComputedStyle(el);
        left += Number.parseFloat(style.paddingLeft) || 0;
        right += Number.parseFloat(style.paddingRight) || 0;
        bottom += Number.parseFloat(style.paddingBottom) || 0;
      }

      const margin = `0px ${-right}px ${-bottom}px ${-left}px`;
      if (margin !== lastMargin) {
        lastMargin = margin;
        layoutEl.style.margin = margin;
      }
      // dvh, so viewport changes need no JS; only the offset from the top can move.
      const minHeight = `calc(100dvh - ${documentTop(layoutEl)}px)`;
      if (minHeight !== lastMinHeight) {
        lastMinHeight = minHeight;
        layoutEl.style.minHeight = minHeight;
      }
    };

    applyFit();
    // Padding changes alter a wrapper's content box even at a fixed outer size.
    const observer = new ResizeObserver(applyFit);
    observer.observe(document.documentElement);
    for (const el of hostWrappers) {
      observer.observe(el);
    }
    return () => {
      observer.disconnect();
      layoutEl.style.margin = '';
      layoutEl.style.minHeight = '';
    };
  }, []);

  return layoutRef;
};

/**
 * App content for federated mode.
 * Similar to EmbeddedLayout from __root.tsx but optimized for MF v2.0.
 */
function FederatedAppContent() {
  const toasterTheme = useIsDarkMode() ? 'dark' : 'light';
  const layoutRef = useHostShellFit();

  return (
    // Flex column so the footer's `margin-top: auto` pins it to the bottom. px-12 is
    // Console's own gutter, released while a page is expanded (globals.css).
    <div
      className="page-expanded-flush flex flex-col px-12 transition-[padding] duration-300 ease-in-out"
      id="mainLayout"
      ref={layoutRef}
    >
      <NullFallbackBoundary>
        <LicenseNotification />
      </NullFallbackBoundary>
      <ModalContainer />
      <AppPageHeader />

      <ErrorDisplay>
        <PageColumn>
          <Outlet />
        </PageColumn>
      </ErrorDisplay>

      <AppFooter />

      <ErrorModalsRenderer />

      {/* sonner isn't an MF-shared singleton, so the host's <Toaster> can't
          surface Console's toasts; mirror __root.tsx's AppContent. */}
      <Toaster position="top-right" richColors theme={toasterTheme} />
    </div>
  );
}
