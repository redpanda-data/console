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
// Matches greedily to end-of-string so nested objects inside `Data:` are
// captured in full — the SDK always serializes `Data: ${JSON.stringify(...)}`
// at the tail of the error message, so the final `}` is reliable.
export const JSON_RPC_DATA_REGEX = /Data:\s*(\{.*\})\s*$/is;
export const JSON_RPC_MESSAGE_REGEX = /error:\s*([^(]+)\s*\(Code:/i;
export const ERROR_PREFIX_STREAMING_REGEX = /^Error during streaming[^:]*:\s*/i;
export const ERROR_PREFIX_SSE_REGEX = /^SSE event contained an error:\s*/i;
export const ERROR_SUFFIX_CODE_REGEX = /\s*\(Code:\s*-?\d+\).*$/i;

/**
 * Human-readable metadata for a parsed A2A / MCP / JSON-RPC error.
 *
 * - `title` — short noun phrase safe to surface in a headline / alert title.
 * - `hint` — one-sentence remediation tip. Points the user at what to try
 *   next (check credentials, retry, update the agent, etc). May be undefined
 *   when we don't have a sharper suggestion than the raw server message.
 */
export type ParsedError = JSONRPCError & {
  title: string;
  hint?: string;
};

type CodeMeta = { title: string; hint?: string };

/**
 * Well-known JSON-RPC 2.0, A2A-protocol and MCP error codes mapped to a
 * human-readable title + actionable hint.
 *
 * Sources:
 *  - JSON-RPC 2.0 standard errors: https://www.jsonrpc.org/specification#error_object
 *  - A2A protocol extensions: a2a-go/a2a/errors.go
 *  - MCP errors: @modelcontextprotocol/sdk/types.js (ErrorCode enum)
 *
 * The MCP SDK reuses the JSON-RPC 2.0 standard codes plus `-32002` (Resource
 * Not Found) for its resource URI lookups. MCP tool-execution failures are
 * typically surfaced as `InternalError` (`-32603`) with structured `data`.
 */
const ERROR_CODE_TABLE: Record<number, CodeMeta> = {
  // ---- JSON-RPC 2.0 standard errors ----
  [-32_700]: {
    title: 'Parse Error',
    hint: 'The agent sent a payload that is not valid JSON. Retry — if it persists the backend is likely unreachable or misconfigured.',
  },
  [-32_600]: {
    title: 'Invalid Request',
    hint: 'The request does not conform to JSON-RPC 2.0. This is usually a client/SDK version mismatch — check that the frontend and backend are on compatible A2A versions.',
  },
  [-32_601]: {
    title: 'Method Not Found',
    hint: "The agent does not expose this method. Confirm the agent's capabilities advertise the A2A/MCP operation you tried to invoke.",
  },
  [-32_602]: {
    title: 'Invalid Params',
    hint: 'The request arguments are rejected by the agent. Inspect the `data` field for a field-level reason.',
  },
  [-32_603]: {
    title: 'Internal Error',
    hint: "The agent failed while handling the request. Retry — if it persists, check the agent's server logs.",
  },
  [-32_000]: {
    title: 'Server Error',
    hint: 'The agent returned an implementation-defined server error. Retry; if it persists, the agent owner should be notified.',
  },
  // ---- A2A protocol extensions ----
  [-32_001]: {
    title: 'Task Not Found',
    hint: "The task id has expired or was never created. Start a new conversation to re-seed the agent's task state.",
  },
  [-32_002]: {
    title: 'Task Not Cancelable',
    hint: 'This task has already completed or is in a terminal state — cancel does not apply.',
  },
  [-32_003]: {
    title: 'Push Notifications Not Supported',
    hint: "The agent's capabilities do not advertise push notifications. Check the agent card.",
  },
  [-32_004]: {
    title: 'Unsupported Operation',
    hint: 'The agent does not support the A2A/MCP operation you invoked. Check the agent supports A2A and MCP.',
  },
  [-32_005]: {
    title: 'Content Type Not Supported',
    hint: 'Switch the input content type (for example, drop binary parts) and retry.',
  },
  [-32_006]: {
    title: 'Invalid Agent Response',
    hint: 'The agent returned a response that does not conform to A2A. This is typically an agent-side bug.',
  },
  [-32_007]: {
    title: 'Authenticated Extended Card Not Configured',
    hint: 'The agent is configured without an authenticated extended card. Contact the agent owner to enable it.',
  },
  [-32_008]: {
    title: 'Authentication Failed',
    hint: 'Your credentials were rejected. Re-authenticate and try again.',
  },
  [-32_009]: {
    title: 'Forbidden',
    hint: 'You are authenticated but not authorised for this agent. Contact the agent owner to grant access.',
  },
};

/**
 * Look up a known title + hint for the given JSON-RPC / A2A / MCP error code.
 * Returns a synthetic title of the form "Error <code>" for codes in the
 * JSON-RPC implementation-defined server range (-32099 to -32000) without a
 * specific mapping. For anything else, returns the fallback title "Error".
 */
export function lookupErrorMeta(code: number): CodeMeta {
  const known = ERROR_CODE_TABLE[code];
  if (known) {
    return known;
  }
  // JSON-RPC reserves -32099..-32000 for server-defined errors. Surface the
  // code so operators can correlate with server logs.
  if (code >= -32_099 && code <= -32_000) {
    return {
      title: `Server Error ${code}`,
      hint: 'The agent returned an implementation-defined server error. Retry; if it persists, the agent owner should be notified.',
    };
  }
  if (code === -1) {
    // Sentinel we use when the regex could not parse a code out of the
    // stringified SDK error.
    return { title: 'Error' };
  }
  return { title: `Error ${code}` };
}

/**
 * Parse A2A/JSON-RPC/MCP error details from an error message string.
 *
 * Returns a `ParsedError` with:
 *  - `code`, `message`, `data` — raw JSON-RPC fields (or sentinels when absent)
 *  - `title` — human-readable noun phrase for headline display
 *  - `hint` — optional remediation tip the UI can render below the message
 */
export const parseA2AError = (error: unknown): ParsedError => {
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

  const { title, hint } = lookupErrorMeta(code);

  return {
    code,
    message: message || 'Unknown error',
    data,
    title,
    hint,
  };
};
