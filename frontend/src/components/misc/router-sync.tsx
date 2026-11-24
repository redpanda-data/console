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
import { toast } from 'sonner';

import { config as appConfig, isEmbedded } from '../../config';
import { trackHubspotPage } from '../../hubspot/hubspot-tracking';
import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';

/**
 * RouterSync replaces the legacy HistorySetter component.
 * It syncs TanStack Router's navigation functions to appGlobal
 * so that non-React code can still use appGlobal.historyPush() etc.
 *
 * In embedded mode, it also notifies the shell (Cloud UI) when Console
 * navigates internally, allowing the shell to sync its router state.
 *
 * Federated hosts use onRouteChange; legacy embedded hosts receive the window navigation event instead.
 */
export const RouterSync = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRouter();
  const previousPathRef = useRef<string>('');

  useEffect(() => {
    appGlobal.setNavigate((to: string, options?: { replace?: boolean }) => {
      navigate({ to, replace: options?.replace }).catch((error: unknown) => {
        toast.error('Failed to navigate', { description: String(error) });
      });
    });
    appGlobal.setRouter(router);
  }, [navigate, router]);

  useEffect(() => {
    api.errors = [];

    if (location.pathname) {
      trackHubspotPage(location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    appGlobal.setLocation(location);
  }, [location]);

  useEffect(() => {
    if (isEmbedded() && !isFederatedMode() && location.pathname && previousPathRef.current !== location.pathname) {
      window.dispatchEvent(new CustomEvent('[console] navigated', { detail: location.pathname }));
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
};

function isFederatedMode() {
  return appConfig.clusterId !== undefined && appConfig.clusterId !== '';
}
