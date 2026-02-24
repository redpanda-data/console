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

import type { JSONRPCError } from '@a2a-js/sdk';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircleIcon } from 'lucide-react';

type A2AErrorBlockProps = {
  error: JSONRPCError;
  timestamp: Date;
};

/**
 * Map JSON-RPC error codes to human-readable names
 */
/**
 * Map JSON-RPC/A2A error codes to human-readable names
 * Based on a2a-go/a2a/errors.go codeToError mapping
 */
const getErrorCodeName = (code: number): string => {
  const errorCodes: Record<number, string> = {
    // Standard JSON-RPC 2.0 errors
    [-32_700]: 'Parse Error',
    [-32_600]: 'Invalid Request',
    [-32_601]: 'Method Not Found',
    [-32_602]: 'Invalid Params',
    [-32_603]: 'Internal Error',
    [-32_000]: 'Server Error',
    // A2A-specific errors
    [-32_001]: 'Task Not Found',
    [-32_002]: 'Task Not Cancelable',
    [-32_003]: 'Push Notifications Not Supported',
    [-32_004]: 'Unsupported Operation',
    [-32_005]: 'Content Type Not Supported',
    [-32_006]: 'Invalid Agent Response',
    [-32_007]: 'Authenticated Extended Card Not Configured',
    [-32_008]: 'Authentication Failed',
    [-32_009]: 'Forbidden',
  };

  return errorCodes[code] || `Error ${code}`;
};

/**
 * A2A Error Block - displays JSON-RPC errors with full details
 */
export const A2AErrorBlock = ({ error, timestamp }: A2AErrorBlockProps) => {
  const time = timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  const errorCodeName = getErrorCodeName(error.code);
  const hasData = error.data && Object.keys(error.data).length > 0;

  return (
    <Alert className="mb-4" icon={<AlertCircleIcon />} variant="destructive">
      <AlertTitle>{errorCodeName}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <Text className="text-destructive/90" variant="body">
            {error.message}
          </Text>

          <div className="mt-1 flex flex-col gap-1 rounded border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs">
            <div className="flex gap-2">
              <span className="font-semibold text-destructive">code:</span>
              <span>{error.code}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-destructive">message:</span>
              <span>{error.message}</span>
            </div>
            {Boolean(hasData) && (
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-destructive">data:</span>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(error.data, null, 2)}</pre>
              </div>
            )}
            <div className="mt-1 flex gap-2 border-destructive/20 border-t pt-1 text-destructive/60">
              <span className="font-semibold">time:</span>
              <span>{time}</span>
            </div>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};
