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

// WARNING: Keep the array extensions ahead of modules that use them at load time.
import '../utils/array-extensions';
import 'clipboard-polyfill/overwrite-globals';

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import '@xyflow/react/dist/base.css';
import '@xyflow/react/dist/style.css';

import '../index.scss';
import '../index-cloud-integration.scss';
import '../assets/fonts/open-sans.css';
import '../assets/fonts/poppins.css';
import '../assets/fonts/quicksand.css';
import '../assets/fonts/kumbh-sans.css';
import '../globals.css';

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
import { useClusterFenceStore } from '../stores/cluster-fence-store';

// WARNING: The federated root must use a Console-only module path; Cloud UI's __root module otherwise shadows Console's in the shared dev runtime.
function createFederatedRouteTree() {
  const childRoutes = routeTree.children ? Object.values(routeTree.children) : [];
  for (const child of childRoutes) {
    child.options.getParentRoute = () => federatedRootRoute;
  }
  return federatedRootRoute._addFileChildren(childRoutes);
}

const federatedRouteTree = createFederatedRouteTree();

function createTokenRefreshInterceptor(tokenManager: TokenManager) {
  const interceptor: Interceptor = (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (!(error instanceof ConnectError && error.code === Code.Unauthenticated)) {
        throw error;
      }

      try {
        await tokenManager.refresh();
      } catch {
        throw error;
      }

      if (config.jwt) {
        request.header.set('Authorization', `Bearer ${config.jwt}`);
      }
      return await next(request);
    }
  };
  return interceptor;
}

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
  onOpenCluster,
}: ConsoleAppProps) {
  useEffect(() => {
    useClusterFenceStore.getState().setOpenCluster(onOpenCluster ?? null);
  }, [onOpenCluster]);

  const queryClient = useMemo(() => createFederatedQueryClient(), []);

  const tokenManager = useFederatedTokenManager(getAccessToken);

  const tokenRefreshInterceptor = useMemo(() => createTokenRefreshInterceptor(tokenManager), [tokenManager]);

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

  const router = useFederatedRouter(queryClient, dataplaneTransport, initialPath);

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

/** Cloud UI's Module Federation v2 entry point. Switching clusters starts a fresh Console instance. */
export function ConsoleApp(props: ConsoleAppProps) {
  return <ConsoleAppInner key={props.clusterId} {...props} />;
}

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
  const [tokenManager] = useState(() => new TokenManager(getAccessToken, setConfigJwt));
  useEffect(
    function updateTokenProvider() {
      tokenManager.setGetAccessToken(getAccessToken);
    },
    [getAccessToken, tokenManager]
  );
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
  const hostCallbacks = useRef({ onSidebarItemsChange, onBreadcrumbsChange });
  useLayoutEffect(
    function updateHostCallbacks() {
      hostCallbacks.current = { onSidebarItemsChange, onBreadcrumbsChange };
    },
    [onSidebarItemsChange, onBreadcrumbsChange]
  );
  useEffect(
    function disposeQueryClientOnUnmount() {
      return () => queryClient.clear();
    },
    [queryClient]
  );
  useEffect(() => {
    let setupTeardown: (() => void) | undefined;
    let cancelled = false;
    setFailure(null);

    const initialize = async () => {
      await tokenManager.refresh();
      if (cancelled) {
        return;
      }

      setupTeardown = setup({
        clusterId,
        setSidebarItems: (items) => hostCallbacks.current.onSidebarItemsChange?.(items),
        setBreadcrumbs: (items) => hostCallbacks.current.onBreadcrumbsChange?.(items),
        featureFlags,
        ...configOverrides,
        jwt: config.jwt,
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

    return () => {
      cancelled = true;
      uiSettingsTeardown();
      setupTeardown?.();
      tokenManager.reset();
    };
  }, [tokenManager, clusterId, featureFlags, configOverrides, attempt]);
  const retry = () => {
    setAttempt((previous) => previous + 1);
  };
  return { isInitialized, error: failure?.attempt === attempt ? failure.error : null, retry };
}

function useFederatedRouter(queryClient: QueryClient, dataplaneTransport: Transport, initialPath: string) {
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

    let replaced = false;
    const unsubscribeHistory = router.history.subscribe(({ action }) => {
      replaced = action.type === 'REPLACE';
    });

    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      const newPath = toLocation.pathname + (toLocation.searchStr || '');

      if (newPath === lastNotifiedPathRef.current) {
        return;
      }

      lastNotifiedPathRef.current = newPath;
      onRouteChange(newPath, { replace: replaced });
    });

    return () => {
      unsubscribeHistory();
      unsubscribe();
    };
  }, [router, onRouteChange]);
  useEffect(() => {
    if (!(navigateTo && isInitialized && router)) {
      return;
    }

    const currentPath = router.state.location.pathname + (router.state.location.searchStr || '');
    if (navigateTo !== currentPath) {
      lastNotifiedPathRef.current = navigateTo;
      router.navigate({ href: navigateTo }).catch((error: unknown) => {
        toast.error('Failed to navigate', { description: String(error) });
      });
    }
  }, [navigateTo, isInitialized, router]);
}
