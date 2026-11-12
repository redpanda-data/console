/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */
import { config } from '../runtime-config';

export class RestTimeoutError extends Error {
  constructor(m: string) {
    super(m);
    Object.setPrototypeOf(this, RestTimeoutError.prototype);
  }
}
export function fetchWithTimeout(url: RequestInfo, timeoutMs: number, options?: RequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let hasSettled = false;
    config.fetch(url, options).then(
      (result) => {
        hasSettled = true;
        resolve(result);
      },
      (error: unknown) => {
        hasSettled = true;
        reject(error);
      }
    );

    setTimeout(() => {
      // no need to construct an error when already settled
      if (hasSettled) {
        return;
      }

      const timeStr = timeoutMs < 1000 ? `${timeoutMs} ms` : `${timeoutMs / 1000} sec`;
      reject(new RestTimeoutError(`Request timed out after ${timeStr}: ${typeof url === 'string' ? url : url.url}`));
    }, timeoutMs);
  });
}
