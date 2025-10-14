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

'use client';

import { TransportProvider } from '@connectrpc/connect-query';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import type { ReactNode } from 'react';
import { forwardRef, useImperativeHandle } from 'react';
import { useDeleteServiceAccountMutation } from 'react-query/api/controlplane/service-account';

type AIAgentDeleteHandlerProps = {
  children: ReactNode;
};

export type AIAgentDeleteHandlerRef = {
  deleteServiceAccount: (serviceAccountId: string) => Promise<void>;
  isPending: boolean;
};

const AIAgentDeleteHandlerComponent = forwardRef<AIAgentDeleteHandlerRef, object>((_props, ref) => {
  const { mutateAsync: deleteServiceAccount, isPending } = useDeleteServiceAccountMutation({ skipInvalidation: true });

  const handleDeleteServiceAccount = async (serviceAccountId: string) => {
    await deleteServiceAccount({ id: serviceAccountId });
  };

  useImperativeHandle(ref, () => ({
    deleteServiceAccount: handleDeleteServiceAccount,
    isPending,
  }));

  return null;
});

AIAgentDeleteHandlerComponent.displayName = 'AIAgentDeleteHandlerComponent';

export const AIAgentDeleteHandler = forwardRef<AIAgentDeleteHandlerRef, AIAgentDeleteHandlerProps>(
  ({ children }, ref) => {
    const controlplaneTransport = useControlplaneTransport();

    return (
      <>
        <TransportProvider transport={controlplaneTransport}>
          <AIAgentDeleteHandlerComponent ref={ref} />
        </TransportProvider>
        {children}
      </>
    );
  }
);

AIAgentDeleteHandler.displayName = 'AIAgentDeleteHandler';
