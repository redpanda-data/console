/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { TransportProvider } from '@connectrpc/connect-query';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';

import { ServiceAccountDisplay } from './service-account-display';

type ServiceAccountSectionProps = {
  serviceAccountId: string;
};

export const ServiceAccountSection = ({ serviceAccountId }: ServiceAccountSectionProps) => {
  const controlplaneTransport = useControlplaneTransport();

  return (
    <TransportProvider transport={controlplaneTransport}>
      <ServiceAccountDisplay serviceAccountId={serviceAccountId} />
    </TransportProvider>
  );
};
