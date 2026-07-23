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
import { useLayoutEffect, useRef } from 'react';

import { DebugHelper } from '../components/debug-helper/debug-helper';
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
 * Cancels the gutters the Cloud UI host puts around the federated Console outlet
 * (`p-10 pt-8` on its layout container) with equal negative margins, so Console owns
 * its own page spacing. Measured from the live DOM rather than hardcoded: either
 * project can deploy first — once the host removes its padding the compensation
 * measures 0. Top padding is left alone; cancelling it would pull Console under the
 * host's breadcrumb header.
 */
const useCancelHostGutters = (enabled: boolean) => {
  const layoutRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const layoutEl = layoutRef.current;
    if (!(enabled && layoutEl)) {
      return;
    }

    // Applying identical margins would retrigger the ResizeObserver (the margins
    // change ancestor sizes), so only write on change.
    let lastMargin: string | null = null;
    const update = () => {
      let left = 0;
      let right = 0;
      let bottom = 0;
      for (let el = layoutEl.parentElement; el && el !== document.body; el = el.parentElement) {
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
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    // A host padding change alters the ancestor's content-box even when its outer
    // size is fixed, so observing the chain catches host-side padding swaps.
    for (let el = layoutEl.parentElement; el && el !== document.body; el = el.parentElement) {
      observer.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      layoutEl.style.margin = '';
    };
  }, [enabled]);

  return layoutRef;
};

/**
 * App content for federated mode.
 * Similar to EmbeddedLayout from __root.tsx but optimized for MF v2.0.
 */
function FederatedAppContent() {
  const matches = useMatches();
  const { pathname } = useLocation();
  // Fullscreen routes own their chrome — breadcrumb-only header, no padding/footer
  // (none currently exist; the machinery stays for future true-fullscreen pages).
  // staticData is the source of truth, but on soft navigation useMatches() lags
  // useLocation() by a render or two, so fall back to a path check to avoid flashing
  // full chrome on the way in. Single return with stable element positions keeps the
  // <Outlet> mounted across fullscreen↔normal navigation.
  const isFullscreen = matches.some((m) => m.staticData.fullscreen) || isFullscreenPath(pathname);
  const toasterTheme = useIsDarkMode() ? 'dark' : 'light';
  const layoutRef = useCancelHostGutters(!isFullscreen);

  return (
    // Flex column so the footer's `margin-top: auto` pins it to the layout bottom
    // (AppFooter stretches #mainLayout to the viewport via min-height). px-12 is
    // Console's own gutter — the host gutter is cancelled above, and pages release
    // it by stamping data-page-expanded on <html> (rule in index.scss).
    <div
      className={isFullscreen ? undefined : 'flex flex-col px-12 transition-[padding] duration-300 ease-in-out'}
      id="mainLayout"
      ref={layoutRef}
    >
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
