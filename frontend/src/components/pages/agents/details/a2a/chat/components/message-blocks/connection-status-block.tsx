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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircleIcon, LoaderCircleIcon, RefreshCwIcon, WifiIcon, WifiOffIcon } from 'lucide-react';

type ConnectionStatusBlockProps = {
  status: 'disconnected' | 'reconnecting' | 'reconnected' | 'gave-up';
  attempt?: number;
  maxAttempts?: number;
  timestamp: Date;
};

export const ConnectionStatusBlock = ({ status, attempt, maxAttempts, timestamp }: ConnectionStatusBlockProps) => {
  const time = timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (status === 'reconnected') {
    return (
      <div className="mb-2 flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
        <WifiIcon className="size-3" />
        <span>Reconnected at {time}</span>
      </div>
    );
  }

  if (status === 'disconnected' || status === 'reconnecting') {
    const label =
      status === 'reconnecting' && attempt
        ? `Reconnecting... (attempt ${attempt} of ${maxAttempts ?? '?'})`
        : 'Connection lost, attempting to reconnect...';

    return (
      <Alert className="mb-4" icon={<WifiOffIcon />} variant="warning">
        <AlertTitle className="flex items-center gap-2">
          {label}
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        </AlertTitle>
        <AlertDescription>
          <Text className="text-blue-600 text-xs" variant="body">
            The agent task is still running. Trying to re-establish the event stream.
          </Text>
        </AlertDescription>
      </Alert>
    );
  }

  // gave-up
  return (
    <Alert className="mb-4" icon={<AlertCircleIcon />} variant="destructive">
      <AlertTitle>Connection lost</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <Text className="text-destructive/90" variant="body">
          Unable to reconnect after {maxAttempts ?? '?'} attempts. The agent task may still be running server-side.
        </Text>
        <Button onClick={() => window.location.reload()} size="sm" variant="outline">
          <RefreshCwIcon />
          Reload to check status
        </Button>
      </AlertDescription>
    </Alert>
  );
};
