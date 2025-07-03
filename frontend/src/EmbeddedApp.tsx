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

import queryClient from 'queryClient';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { ChakraProvider, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomFeatureFlagProvider } from 'custom-feature-flag-provider';
import { observer } from 'mobx-react';
import { protobufRegistry } from 'protobuf-registry';
import AppContent from './components/layout/Content';
import { ErrorBoundary } from './components/misc/ErrorBoundary';
import HistorySetter from './components/misc/HistorySetter';
import {
  addBearerTokenInterceptor,
  checkExpiredLicenseInterceptor,
  getGrpcBasePath,
  type SetConfigArguments,
  setup,
} from './config';
import { appGlobal } from './state/appGlobal';

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
   * LaunchDarkly feature flags to be used in console UI when in embedded mode.
   */
  featureFlags?: Record<string, boolean>;
}

function EmbeddedApp({ basePath, ...p }: EmbeddedProps) {
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
  const transport = createConnectTransport({
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
        <ChakraProvider theme={redpandaTheme} toastOptions={redpandaToastOptions} resetCSS={false}>
          <TransportProvider transport={transport}>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </QueryClientProvider>
          </TransportProvider>
        </ChakraProvider>
      </BrowserRouter>
    </CustomFeatureFlagProvider>
  );
}

export default observer(EmbeddedApp);
