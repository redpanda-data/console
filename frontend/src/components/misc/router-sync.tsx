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

import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { config as appConfig, isEmbedded } from '../../config';
import { trackHubspotPage } from '../../hubspot/hubspot.helper';
import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';

/**
 * RouterSync replaces the legacy HistorySetter component.
 * It syncs TanStack Router's navigation functions to appGlobal
 * so that non-React code can still use appGlobal.historyPush() etc.
 *
 * In embedded mode, it also notifies the shell (Cloud UI) when Console
 * navigates internally, allowing the shell to sync its router state.
 */
export const RouterSync = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRouter();
  const previousPathRef = useRef<string>('');

  // Sync navigation functions to appGlobal
  useEffect(() => {
    appGlobal.setNavigate((to: string, options?: { replace?: boolean }) => {
      navigate({ to, replace: options?.replace });
    });
    appGlobal.setRouter(router);
  }, [navigate, router]);

  // Track page navigation in HubSpot and clear errors on route change
  useEffect(() => {
    // Clear errors when navigating to a new route
    api.errors = [];

    if (location.pathname) {
      trackHubspotPage(location.pathname);
    }
  }, [location.pathname]);

  // Sync location to appGlobal
  useEffect(() => {
    appGlobal.setLocation(location);
  }, [location]);

  // Notify shell (Cloud UI) when Console navigates internally.
  // Skip in MFv2 federated mode — console-app.tsx handles navigation sync
  // via the onRouteChange callback. Dispatching events here too creates a
  // feedback loop: Console dispatches → cloud-ui navigates → Console sees
  // new path → dispatches again.
  useEffect(() => {
    if (isEmbedded() && !isFederatedMode() && location.pathname && previousPathRef.current !== location.pathname) {
      // Dispatch event for shell to sync its router state
      window.dispatchEvent(new CustomEvent('[console] navigated', { detail: location.pathname }));
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
};

/**
 * Detect MFv2 federated mode. In federated mode, console-app.tsx sets up its own
 * navigation sync via onRouteChange — the legacy window event dispatch is not needed.
 */
function isFederatedMode(): boolean {
  // config.clusterId is only set in federated mode (via setup() in console-app.tsx).
  // In standalone mode, it's undefined.
  return appConfig.clusterId !== undefined && appConfig.clusterId !== '';
}
