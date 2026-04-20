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

/**
 * Regex patterns for parsing JSON-RPC error details from error messages.
 *
 * Why regex? The a2a-js SDK throws plain Error objects with formatted strings
 * instead of structured error objects. The SDK has access to the structured
 * JSON-RPC error (code, message, data) but serializes it into the error message:
 *
 *   // a2a-js/src/client/transports/json_rpc_transport.ts
 *   if ('error' in a2aStreamResponse) {
 *     const err = a2aStreamResponse.error;
 *     throw new Error(
 *       `SSE event contained an error: ${err.message} (Code: ${err.code}) Data: ${JSON.stringify(err.data || {})}`
 *     );
 *   }
 *
 * Until the SDK exposes structured error data, we parse it back out.
 */
export const JSON_RPC_CODE_REGEX = /\(Code:\s*(-?\d+)\)/i;
export const JSON_RPC_DATA_REGEX = /Data:\s*(\{[^}]*\})/i;
export const JSON_RPC_MESSAGE_REGEX = /error:\s*([^(]+)\s*\(Code:/i;
export const ERROR_PREFIX_STREAMING_REGEX = /^Error during streaming[^:]*:\s*/i;
export const ERROR_PREFIX_SSE_REGEX = /^SSE event contained an error:\s*/i;
export const ERROR_SUFFIX_CODE_REGEX = /\s*\(Code:\s*-?\d+\).*$/i;

/**
 * Parse A2A/JSON-RPC error details from an error message string.
 */
export const parseA2AError = (error: unknown): JSONRPCError => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Try to parse JSON-RPC error from the error message
  // Format: "SSE event contained an error: <message> (Code: <code>) Data: <json> (code: <connect_code>)"
  const jsonRpcMatch = errorMessage.match(JSON_RPC_CODE_REGEX);
  const dataMatch = errorMessage.match(JSON_RPC_DATA_REGEX);
  const messageMatch = errorMessage.match(JSON_RPC_MESSAGE_REGEX);

  // Extract just the core error message without wrapper text
  let message = errorMessage;
  if (messageMatch?.[1]) {
    message = messageMatch[1].trim();
  } else {
    // Remove common prefixes
    message = message
      .replace(ERROR_PREFIX_STREAMING_REGEX, '')
      .replace(ERROR_PREFIX_SSE_REGEX, '')
      .replace(ERROR_SUFFIX_CODE_REGEX, '')
      .trim();
  }

  const code = jsonRpcMatch?.[1] ? Number.parseInt(jsonRpcMatch[1], 10) : -1;

  let data: Record<string, unknown> | undefined;
  if (dataMatch?.[1]) {
    try {
      data = JSON.parse(dataMatch[1]);
    } catch {
      // Invalid JSON in data field
    }
  }

  return {
    code,
    message: message || 'Unknown error',
    data,
  };
};
