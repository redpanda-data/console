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
import { Heading, Text } from '../redpanda-ui/components/typography';

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
        description: 'The server took too long to respond. Please try again.',
      };
    case Code.Internal:
      return {
        title: 'Internal Server Error',
        description: 'An unexpected error occurred on the server. Please try again.',
      };
    default:
      return {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your connection and try again.',
      };
  }
}

export const ConnectionErrorUI: FC<ConnectionErrorUIProps> = ({ error, onRetry }) => {
  const { title, description } = getErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertIcon className="h-6 w-6 text-red-600" />
          </div>
          <Heading className="mb-2 text-neutral-900" level={3}>
            {title}
          </Heading>
          <Text className="mb-6 text-neutral-600" variant="small">
            {description}
          </Text>
          <Button onClick={onRetry}>
            <RefreshIcon className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
};
