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
// Installs `navigator.clipboard` where the browser withholds it — see app.tsx.
import 'clipboard-polyfill/overwrite-globals';

import { Component, type ErrorInfo, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

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

import { Code, ConnectError, type Interceptor, type Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { protobufRegistry } from 'protobuf-registry';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { toast } from 'sonner';

import { FederatedProviders } from './federated-providers';
import { federatedRootRoute } from './federated-routes';
import { TokenManager } from './token-manager';
import type { ConsoleAppProps } from './types';
import { NotFoundPage } from '../components/misc/not-found-page';
import { Alert, AlertDescription } from '../components/redpanda-ui/components/alert';
import { Button } from '../components/redpanda-ui/components/button';
import { addBearerTokenInterceptor, checkExpiredLicenseInterceptor, config, getGrpcBasePath, setup } from '../config';
import { routeTree } from '../routeTree.gen';
import { installUISettingsSideEffects } from '../state/ui';

/**
 * Re-root the generated route tree onto Console's federated root.
 *
 * Both apps compile a module with the id `./src/routes/__root.tsx`, and in the shared MF dev
 * runtime the host's wins — so the embedded Console would render Cloud UI's root chrome instead of
 * its own (breaking nuqs, crashing KBar, emptying the sidebar). `federatedRootRoute` sits at a
 * Console-unique path that cannot collide. Standalone and legacy-embedded entries keep `routeTree`.
 */
function createFederatedRouteTree() {
  const childRoutes = routeTree.children ? Object.values(routeTree.children) : [];
  for (const child of childRoutes) {
    child.options.getParentRoute = () => federatedRootRoute;
  }
  return federatedRootRoute._addFileChildren(childRoutes);
}

const federatedRouteTree = createFederatedRouteTree();

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
            <h2 className="text-heading-md font-semibold text-destructive">Something went wrong</h2>
            <p className="mt-2 text-body text-subtle">Console encountered an error.</p>
            {this.state.error ? (
              <p className="mt-1 font-mono text-body-sm text-subtle">{this.state.error.message}</p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-surface-informative px-4 py-2 text-body font-medium text-informative-foreground hover:bg-surface-informative-hover"
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
        staleTime: LONG_LIVED_CACHE_STALE_TIME,
        retry: 1,
      },
    },
  });
}

const setConfigJwt = (token: string) => {
  config.jwt = token;
};

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
  // Create stable QueryClient instance
  const queryClient = useMemo(() => createFederatedQueryClient(), []);

  // Create stable TokenManager instance with initial getAccessToken
  const tokenManager = useFederatedTokenManager(getAccessToken);

  // Create token refresh interceptor using TokenManager
  const tokenRefreshInterceptor = useMemo(() => createTokenRefreshInterceptor(tokenManager), [tokenManager]);

  // Initialize Console on mount and cleanup on unmount
  const initialization = useFederatedInitialization({
    tokenManager,
    queryClient,
    clusterId,
    onSidebarItemsChange,
    onBreadcrumbsChange,
    featureFlags,
    config: configOverrides,
    onError,
  });

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
  const router = useFederatedRouter(queryClient, dataplaneTransport, initialPath);

  // Subscribe to route changes and notify host (with loop prevention)
  useHostNavigation(router, initialPath, initialization.isInitialized, onRouteChange, navigateTo);

  return (
    <FederatedInitialization initialization={initialization}>
      <ConsoleErrorBoundary onError={onError}>
        <FederatedProviders featureFlags={featureFlags} queryClient={queryClient} transport={dataplaneTransport}>
          <RouterProvider router={router} />
        </FederatedProviders>
      </ConsoleErrorBoundary>
    </FederatedInitialization>
  );
}

export const ConsoleApp = ConsoleAppInner;

export default ConsoleApp;

function FederatedInitialization({
  initialization: { isInitialized, error, retry },
  children,
}: {
  initialization: ReturnType<typeof useFederatedInitialization>;
  children: ReactNode;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to initialize Console: {error.message}
          <Button onClick={retry} variant="outline">
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return isInitialized ? children : null;
}

function useFederatedTokenManager(getAccessToken: ConsoleAppProps['getAccessToken']) {
  const [tokenManager] = useState(
    () =>
      new TokenManager(async () => {
        const token = await getAccessToken();
        setConfigJwt(token);
        return token;
      })
  );
  useEffect(() => {
    tokenManager.setGetAccessToken(async () => {
      const token = await getAccessToken();
      setConfigJwt(token);
      return token;
    });
  }, [getAccessToken, tokenManager]);
  return tokenManager;
}

function useFederatedInitialization({
  tokenManager,
  queryClient,
  clusterId,
  onSidebarItemsChange,
  onBreadcrumbsChange,
  featureFlags,
  config: configOverrides,
  onError,
}: Pick<
  ConsoleAppProps,
  'clusterId' | 'onSidebarItemsChange' | 'onBreadcrumbsChange' | 'featureFlags' | 'config' | 'onError'
> & {
  tokenManager: TokenManager;
  queryClient: QueryClient;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [failure, setFailure] = useState<{ attempt: number; error: Error } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const notifyInitializationError = useEffectEvent((error: Error) => onError?.(error, { componentStack: '' }));
  useEffect(() => {
    let setupTeardown: (() => void) | undefined;
    let cancelled = false;
    setFailure(null);

    const initialize = async () => {
      await tokenManager.refresh();
      if (cancelled) {
        return;
      }

      // Setup Console config with overrides
      setupTeardown = setup({
        jwt: config.jwt,
        clusterId,
        setSidebarItems: onSidebarItemsChange,
        setBreadcrumbs: onBreadcrumbsChange,
        featureFlags,
        ...configOverrides,
      });

      setIsInitialized(true);
    };

    initialize().catch((cause: unknown) => {
      if (!cancelled) {
        const initializationError = cause instanceof Error ? cause : new Error(String(cause));
        setFailure({ attempt, error: initializationError });
        notifyInitializationError(initializationError);
      }
    });

    const uiSettingsTeardown = installUISettingsSideEffects();

    // Cleanup on unmount
    return () => {
      cancelled = true;
      uiSettingsTeardown();
      setupTeardown?.();
      tokenManager.reset();
      queryClient.clear();
    };
  }, [
    tokenManager,
    queryClient,
    clusterId,
    onSidebarItemsChange,
    onBreadcrumbsChange,
    featureFlags,
    configOverrides,
    attempt,
  ]);
  const retry = () => {
    setAttempt((previous) => previous + 1);
  };
  return { isInitialized, error: failure?.attempt === attempt ? failure.error : null, retry };
}

function useFederatedRouter(queryClient: QueryClient, dataplaneTransport: Transport, initialPath: string) {
  // Capture initialPath on first render only — subsequent navigation is handled
  // by the navigateTo prop via router.navigate(). Including initialPath in the
  // useMemo deps would recreate the entire router on every host navigation,
  // remounting all route components and retriggering all data fetches.

  const initialPathRef = useRef(initialPath);
  const router = useMemo(() => {
    const memoryHistory = createMemoryHistory({
      initialEntries: [initialPathRef.current],
    });

    const r = createRouter({
      routeTree: federatedRouteTree,
      history: memoryHistory,
      context: {
        basePath: '',
        queryClient,
        dataplaneTransport,
      },
      defaultNotFoundComponent: NotFoundPage,
    });

    return r;
  }, [queryClient, dataplaneTransport]);
  return router;
}

function useHostNavigation(
  router: ReturnType<typeof useFederatedRouter>,
  initialPath: string,
  isInitialized: boolean,
  onRouteChange: ConsoleAppProps['onRouteChange'],
  navigateTo: ConsoleAppProps['navigateTo']
) {
  const lastNotifiedPathRef = useRef<string>(initialPath);
  useEffect(() => {
    if (!onRouteChange) {
      return;
    }

    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      // Include search params so tab state and filters sync to Cloud UI's URL
      const newPath = toLocation.pathname + (toLocation.searchStr || '');

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
  useEffect(() => {
    if (!(navigateTo && isInitialized && router)) {
      return;
    }

    const currentPath = router.state.location.pathname + (router.state.location.searchStr || '');
    if (navigateTo !== currentPath) {
      // Update ref to prevent echo back to host
      lastNotifiedPathRef.current = navigateTo;
      const qIdx = navigateTo.indexOf('?');
      const toPath = qIdx >= 0 ? navigateTo.slice(0, qIdx) : navigateTo;
      const toSearch = qIdx >= 0 ? navigateTo.slice(qIdx + 1) : undefined;
      router
        .navigate({
          to: toPath,
          search: toSearch ? Object.fromEntries(new URLSearchParams(toSearch)) : undefined,
        })
        .catch((error: unknown) => {
          toast.error('Failed to navigate', { description: String(error) });
        });
    }
  }, [navigateTo, isInitialized, router]);
}
