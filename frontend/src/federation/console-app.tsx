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

// Array prototype extensions (must be imported early)
import '../utils/array-extensions';

import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import '@xyflow/react/dist/base.css';
import '@xyflow/react/dist/style.css';

/* start global stylesheets */
import '../index.scss';
import '../index-cloud-integration.scss';
import '../assets/fonts/open-sans.css';
import '../assets/fonts/poppins.css';
import '../assets/fonts/quicksand.css';
import '../assets/fonts/kumbh-sans.css';
/* end global stylesheet */

/* start tailwind styles */
import '../globals.css';
/* end tailwind styles */

import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';

import { FederatedProviders } from './federated-providers';
import { TokenManager } from './token-manager';
import type { ConsoleAppProps } from './types';
import { NotFoundPage } from '../components/misc/not-found-page';
import { addBearerTokenInterceptor, checkExpiredLicenseInterceptor, config, getGrpcBasePath, setup } from '../config';
import { routeTree } from '../routeTree.gen';

/**
 * Creates an interceptor that refreshes the token on 401 and retries the request.
 * Uses TokenManager for deduplication and abort support.
 */
function createTokenRefreshInterceptor(tokenManager: TokenManager): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      // Only handle Unauthenticated errors
      if (!(error instanceof ConnectError && error.code === Code.Unauthenticated)) {
        throw error;
      }

      // Use TokenManager for deduplicated refresh
      try {
        await tokenManager.refresh();
      } catch {
        throw error; // Throw original error if refresh fails
      }

      // Retry the request with refreshed token.
      // Header mutation is necessary because the original request was created
      // with the old token by addBearerTokenInterceptor on the first attempt.
      if (config.jwt) {
        request.header.set('Authorization', `Bearer ${config.jwt}`);
      }
      return await next(request);
    }
  };
}

/**
 * Error boundary for the federated Console app.
 * Reports errors to host via onError callback.
 * Supports recovery via retry button.
 */
class ConsoleErrorBoundary extends Component<
  {
    children: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
  },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onError?: (error: Error, errorInfo: ErrorInfo) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <h2 className="font-semibold text-lg text-red-600">Something went wrong</h2>
            <p className="mt-2 text-gray-600 text-sm">Console encountered an error.</p>
            {this.state.error ? (
              <p className="mt-1 font-mono text-gray-500 text-xs">{this.state.error.message}</p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
              onClick={this.handleRetry}
              type="button"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Create an isolated QueryClient for federated mode.
 * This ensures Console doesn't interfere with host's React Query state.
 */
function createFederatedQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
      },
    },
  });
}

/**
 * Federated Console App component for Module Federation v2.0.
 * This is the main entry point for Cloud UI integration.
 */
function ConsoleAppInner({
  getAccessToken,
  clusterId,
  initialPath = '/topics',
  navigateTo,
  onRouteChange,
  onSidebarItemsChange,
  onBreadcrumbsChange,
  onError,
  config: configOverrides,
  featureFlags,
}: ConsoleAppProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const routerRef = useRef<ReturnType<typeof createRouter<typeof routeTree>> | null>(null);
  // Track last notified path to prevent navigation loops between host and remote
  const lastNotifiedPathRef = useRef<string>(initialPath);

  // Create stable QueryClient instance
  const queryClient = useMemo(() => createFederatedQueryClient(), []);

  // Store getAccessToken in ref so TokenManager always uses latest callback
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  // Create stable TokenManager instance (uses ref to access latest getAccessToken)
  const tokenManager = useMemo(
    () =>
      new TokenManager(async () => {
        const token = await getAccessTokenRef.current();
        config.jwt = token;
        return token;
      }),
    []
  );

  // Create token refresh interceptor using TokenManager
  const tokenRefreshInterceptor = useMemo(() => createTokenRefreshInterceptor(tokenManager), [tokenManager]);

  // Initialize Console on mount and cleanup on unmount
  useEffect(() => {
    const initialize = async () => {
      await tokenManager.refresh();

      // Setup Console config with overrides
      setup({
        jwt: config.jwt,
        clusterId,
        setSidebarItems: onSidebarItemsChange,
        setBreadcrumbs: onBreadcrumbsChange,
        featureFlags,
        ...configOverrides,
      });

      setIsInitialized(true);
    };

    initialize();

    // Cleanup on unmount
    return () => {
      tokenManager.reset();
      queryClient.clear();
    };
  }, [tokenManager, queryClient, clusterId, onSidebarItemsChange, onBreadcrumbsChange, featureFlags, configOverrides]);

  // Create transport with token interceptors (including refresh on 401)
  const dataplaneTransport = useMemo(
    () =>
      createConnectTransport({
        baseUrl: getGrpcBasePath(configOverrides?.urlOverride?.grpc),
        interceptors: [addBearerTokenInterceptor, tokenRefreshInterceptor, checkExpiredLicenseInterceptor],
        jsonOptions: {
          registry: protobufRegistry,
        },
      }),
    [configOverrides?.urlOverride?.grpc, tokenRefreshInterceptor]
  );

  // Create memory history router (host controls browser URL)
  const router = useMemo(() => {
    const memoryHistory = createMemoryHistory({
      initialEntries: [initialPath],
    });

    const r = createRouter({
      routeTree,
      history: memoryHistory,
      context: {
        basePath: '',
        queryClient,
        dataplaneTransport,
      },
      defaultNotFoundComponent: NotFoundPage,
    });

    routerRef.current = r;
    return r;
  }, [initialPath, queryClient, dataplaneTransport]);

  // Subscribe to route changes and notify host (with loop prevention)
  useEffect(() => {
    if (!onRouteChange) {
      return;
    }

    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      const newPath = toLocation.pathname;

      // Skip if path hasn't changed (prevents loops)
      if (newPath === lastNotifiedPathRef.current) {
        return;
      }

      lastNotifiedPathRef.current = newPath;
      onRouteChange(newPath);
    });

    return () => {
      unsubscribe();
    };
  }, [router, onRouteChange]);

  // Handle navigation from host via navigateTo prop (browser back/forward)
  useEffect(() => {
    if (!(navigateTo && isInitialized && routerRef.current)) {
      return;
    }

    const currentPath = routerRef.current.state.location.pathname;
    if (navigateTo !== currentPath) {
      // Update ref to prevent echo back to host
      lastNotifiedPathRef.current = navigateTo;
      routerRef.current.navigate({ to: navigateTo });
    }
  }, [navigateTo, isInitialized]);

  // Don't render until initialized, don't show anything until then
  if (!isInitialized) {
    return null;
  }

  return (
    <ConsoleErrorBoundary onError={onError}>
      <FederatedProviders featureFlags={featureFlags} queryClient={queryClient} transport={dataplaneTransport}>
        <RouterProvider router={router} />
      </FederatedProviders>
    </ConsoleErrorBoundary>
  );
}

/**
 * Export the observed version of ConsoleApp.
 * This ensures MobX reactivity works correctly.
 */
export const ConsoleApp = observer(ConsoleAppInner);

export default ConsoleApp;
