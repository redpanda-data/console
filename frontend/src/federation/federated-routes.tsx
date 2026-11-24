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

import { ClusterFenceBanner } from '../components/cluster-fence/cluster-fence-banner';
import { ShadowLinkTopologySync } from '../components/cluster-fence/shadow-link-topology-sync';
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
import { useThemeAppearance } from '../hooks/use-theme-appearance';
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
 * Root route for the federated Console. The host supplies navigation; Console's
 * auth check loads user data before publishing endpoint-compatible sidebar items.
 * Console owns its notifications because Sonner is not shared across the host.
 *
 * @remarks Console measures the host shell's side and bottom padding and cancels
 * it without hardcoding values from another deployment. Keep top padding for the
 * host header. The host must use padding, not margins, gaps, or max-width, on
 * those wrappers, keep them free of overflow clipping, and release its max-width
 * when `html[data-page-expanded]` is set.
 */
export const federatedRootRoute = createRootRouteWithContext<FederatedRouterContext>()({
  component: FederatedRootLayout,
});

function FederatedRootLayout() {
  return (
    <>
      <RouterSync />
      <NuqsAdapter>
        <ErrorBoundary>
          <RequireAuth>
            <FederatedAppContent />
          </RequireAuth>
        </ErrorBoundary>
        {process.env.NODE_ENV === 'development' && <DebugHelper />}
      </NuqsAdapter>
    </>
  );
}

const useHostShellFit = () => {
  const layoutRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layoutEl = layoutRef.current;
    if (!layoutEl) {
      return;
    }

    const hostWrappers = chainToBody(layoutEl.parentElement);

    const applyFit = createHostShellUpdater(layoutEl, hostWrappers);

    applyFit();
    return observeHostShell(layoutEl, hostWrappers, applyFit);
  }, []);

  return layoutRef;
};

function FederatedAppContent() {
  const toasterTheme = useThemeAppearance();
  const layoutRef = useHostShellFit();

  return (
    <div
      className="page-expanded-flush flex flex-col px-12 transition-[padding] duration-300 ease-in-out"
      id="mainLayout"
      ref={layoutRef}
    >
      <NullFallbackBoundary>
        <LicenseNotification />
      </NullFallbackBoundary>
      <NullFallbackBoundary>
        <ShadowLinkTopologySync />
      </NullFallbackBoundary>
      <NullFallbackBoundary>
        <ClusterFenceBanner />
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

      <Toaster position="top-right" richColors theme={toasterTheme} />
    </div>
  );
}

function getHostPadding(wrappers: HTMLElement[]) {
  let left = 0;
  let right = 0;
  let bottom = 0;
  for (const element of wrappers) {
    const style = getComputedStyle(element);
    left += Number.parseFloat(style.paddingLeft) || 0;
    right += Number.parseFloat(style.paddingRight) || 0;
    bottom += Number.parseFloat(style.paddingBottom) || 0;
  }
  return { left, right, bottom };
}

function createHostShellUpdater(layoutEl: HTMLDivElement, hostWrappers: HTMLElement[]) {
  // WARNING: Repeated style writes here can retrigger the ResizeObserver on the same wrappers.
  let lastMargin = '';
  let lastMinHeight = '';
  return () => {
    const { left, right, bottom } = getHostPadding(hostWrappers);

    const margin = `0px ${-right}px ${-bottom}px ${-left}px`;
    if (margin !== lastMargin) {
      lastMargin = margin;
      layoutEl.style.margin = margin;
    }
    const minHeight = `calc(100dvh - ${documentTop(layoutEl)}px)`;
    if (minHeight !== lastMinHeight) {
      lastMinHeight = minHeight;
      layoutEl.style.minHeight = minHeight;
    }
  };
}

function observeHostShell(layoutEl: HTMLDivElement, hostWrappers: HTMLElement[], applyFit: () => void) {
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
}
