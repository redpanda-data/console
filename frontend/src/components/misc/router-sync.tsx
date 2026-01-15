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
import { observer } from 'mobx-react';
import { useEffect, useRef } from 'react';

import { isEmbedded } from '../../config';
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
export const RouterSync = observer(() => {
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

  // Notify shell (Cloud UI) when Console navigates internally
  // This enables bidirectional sync between TanStack Router and React Router DOM
  useEffect(() => {
    if (isEmbedded() && location.pathname && previousPathRef.current !== location.pathname) {
      // Dispatch event for shell to sync its router state
      window.dispatchEvent(new CustomEvent('[console] navigated', { detail: location.pathname }));
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
});
