/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

/* start global stylesheets */

import './index.scss';
import './index-cloud-integration.scss';
import './assets/fonts/open-sans.css';
import './assets/fonts/poppins.css';
import './assets/fonts/quicksand.css';
import './assets/fonts/kumbh-sans.css';

/* end global stylesheet */

/* start tailwind styles */
import './globals.css';

/* end tailwind styles */

import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsProvider } from 'analytics-provider';
import { CustomFeatureFlagProvider } from 'custom-feature-flag-provider';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import queryClient from 'query-client';

import AppContent from './components/layout/content';
import { ErrorBoundary } from './components/misc/error-boundary';
import HistorySetter from './components/misc/history-setter';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  type SetConfigArguments,
  setup,
} from './config';
import { appGlobal } from './state/app-global';

export interface EmbeddedProps extends SetConfigArguments {
  /**
   * This is the base url that is used:
   * - when making api requests
   * - to setup the 'basename' in react-router
   *
   * In the simplest case this would be the exact url where the host is running,
   * for example "http://localhost:3001/"
   *
   * When running in cloud-ui the base most likely need to include a few more
   * things like cluster id, etc...
   * So the base would probably be "https://cloud.redpanda.com/NAMESPACE/CLUSTER/"
   */
  basePath?: string;
  /**
   * We want to get explicit confirmation from the Cloud UI (our parent) so that
   * we don't prematurely render console if the higher-order-component Console.tsx might rerender.
   * In the future we might decide to use memo() as well
   */
  isConsoleReadyToMount?: boolean;
  /**
   * Callback for Console to track analytics events
   * @param eventName - The name of the event
   * @param eventData - Optional additional event data
   */
  captureEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
  /**
   * Callback for Console to identify user and track analytics events in one call
   * @param eventName - The name of the event
   * @param eventData - Optional additional event data
   */
  captureUserEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
}

function EmbeddedApp({ basePath, captureEvent, captureUserEvent, ...p }: EmbeddedProps) {
  useEffect(() => {
    const shellNavigationHandler = (event: Event) => {
      const pathname = (event as CustomEvent<string>).detail;
      appGlobal.historyPush(pathname);
    };

    window.addEventListener('[shell] navigated', shellNavigationHandler);

    return () => {
      window.removeEventListener('[shell] navigated', shellNavigationHandler);
    };
  }, []);

  setup(p);

  // This transport handles the grpc requests for the embedded app.
  const dataplaneTransport = createConnectTransport({
    baseUrl: getGrpcBasePath(p.urlOverride?.grpc),
    interceptors: [addBearerTokenInterceptor, checkExpiredLicenseInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });

  if (!p.isConsoleReadyToMount) {
    return null;
  }

  return (
    <CustomFeatureFlagProvider initialFlags={p.featureFlags}>
      <BrowserRouter basename={basePath}>
        <HistorySetter />
        <ChakraProvider resetCSS={false} theme={redpandaTheme} toastOptions={redpandaToastOptions}>
          <AnalyticsProvider
            value={{
              captureEvent,
              captureUserEvent,
            }}
          >
            <TransportProvider transport={dataplaneTransport}>
              <QueryClientProvider client={queryClient}>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </QueryClientProvider>
            </TransportProvider>
          </AnalyticsProvider>
        </ChakraProvider>
      </BrowserRouter>
    </CustomFeatureFlagProvider>
  );
}

export default observer(EmbeddedApp);
