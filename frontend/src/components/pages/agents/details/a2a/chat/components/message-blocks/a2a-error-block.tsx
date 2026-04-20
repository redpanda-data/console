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

import type { JSONRPCError } from '@a2a-js/sdk';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircleIcon } from 'lucide-react';

import { lookupErrorMeta, type ParsedError } from '../../utils/parse-a2a-error';

type A2AErrorBlockProps = {
  // Accept both the raw JSON-RPC error and the parser's enriched variant so
  // legacy call-sites keep working. If a bare `JSONRPCError` comes in we
  // derive the title/hint inline via the shared `lookupErrorMeta` table.
  error: JSONRPCError | ParsedError;
  timestamp: Date;
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

  // Prefer the title/hint that the parser already resolved; fall back to the
  // shared `lookupErrorMeta` so legacy callers that pass a raw
  // `JSONRPCError` still render the same human-readable headline.
  const parsed: ParsedError =
    'title' in error
      ? (error as ParsedError)
      : { ...(error as JSONRPCError), ...lookupErrorMeta((error as JSONRPCError).code) };
  const hasData = parsed.data && Object.keys(parsed.data).length > 0;

  return (
    <Alert className="mb-4" icon={<AlertCircleIcon />} variant="destructive">
      <AlertTitle>{parsed.title}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <Text className="text-destructive/90" variant="body">
            {parsed.message}
          </Text>

          {parsed.hint ? (
            <Text className="text-destructive/80" variant="small">
              {parsed.hint}
            </Text>
          ) : null}

          <div className="mt-1 flex flex-col gap-1 rounded border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs">
            <div className="flex gap-2">
              <span className="font-semibold text-destructive">code:</span>
              <span>{parsed.code}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-destructive">message:</span>
              <span>{parsed.message}</span>
            </div>
            {Boolean(hasData) && (
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-destructive">data:</span>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(parsed.data, null, 2)}
                </pre>
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
