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

import { Code, type ConnectError } from '@connectrpc/connect';
import type { FC } from 'react';

import { AlertIcon, RefreshIcon } from '../icons';
import { Button } from '../redpanda-ui/components/button';

type ConnectionErrorUIProps = {
  error: ConnectError;
  onRetry: () => void;
};

function getErrorMessage(error: ConnectError): { title: string; description: string } {
  switch (error.code) {
    case Code.Unavailable:
      return {
        title: 'Service Unavailable',
        description: 'The server is temporarily unavailable. This may be due to maintenance or high load.',
      };
    case Code.DeadlineExceeded:
      return {
        title: 'Request Timeout',
        description: 'The server took too long to respond. Try again.',
      };
    case Code.Internal:
      return {
        title: 'Internal Server Error',
        description: 'An unexpected error occurred on the server. Try again.',
      };
    case Code.Canceled:
    case Code.Unknown:
    case Code.InvalidArgument:
    case Code.NotFound:
    case Code.AlreadyExists:
    case Code.PermissionDenied:
    case Code.ResourceExhausted:
    case Code.FailedPrecondition:
    case Code.Aborted:
    case Code.OutOfRange:
    case Code.Unimplemented:
    case Code.DataLoss:
    case Code.Unauthenticated:
    default:
      return {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Check your connection and try again.',
      };
  }
}

export const ConnectionErrorUI: FC<ConnectionErrorUIProps> = ({ error, onRetry }) => {
  const { title, description } = getErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle">
      <div className="mx-4 w-full max-w-md rounded-lg bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive-wash">
            <AlertIcon className="size-6" color="var(--color-destructive)" />
          </div>
          <h3 className="mb-2 text-heading-md text-strong">{title}</h3>
          <div className="mb-6 text-body-sm text-subtle">{description}</div>
          <Button onClick={onRetry}>
            <RefreshIcon className="mr-2 size-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
};
