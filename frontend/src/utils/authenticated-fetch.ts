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

import { config } from '../config';

/**
 * Performs a fetch request with authentication headers automatically added.
 * Merges provided headers with the Authorization bearer token from config.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options (method, headers, body, etc.)
 * @returns Promise<Response>
 *
 * @example
 * ```ts
 * const response = await authenticatedFetch('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ foo: 'bar' }),
 * });
 * ```
 */
export function authenticatedFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);

  // Add Authorization header if JWT is available
  if (config.jwt) {
    headers.set('Authorization', `Bearer ${config.jwt}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
