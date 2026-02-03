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
import { TransportProvider } from '@connectrpc/connect-query';
import { ChakraProvider, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Toaster } from '../components/redpanda-ui/components/sonner';
import { TooltipProvider } from '../components/redpanda-ui/components/tooltip';
import { CustomFeatureFlagProvider } from '../custom-feature-flag-provider';

type FederatedProvidersProps = {
  children: ReactNode;
  transport: Transport;
  queryClient: QueryClient;
  featureFlags?: Record<string, boolean>;
};

/**
 * Provider stack for federated Console app.
 * Adapted from embedded-app.tsx but designed for MF v2.0 integration.
 */
export function FederatedProviders({ children, transport, queryClient, featureFlags }: FederatedProvidersProps) {
  return (
    <CustomFeatureFlagProvider initialFlags={featureFlags}>
      <ChakraProvider resetCSS={false} theme={redpandaTheme} toastOptions={redpandaToastOptions}>
        <TransportProvider transport={transport}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </TransportProvider>
      </ChakraProvider>
    </CustomFeatureFlagProvider>
  );
}
