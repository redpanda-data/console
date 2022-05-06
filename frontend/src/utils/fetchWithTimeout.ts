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



export class RestTimeoutError extends Error {
    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, RestTimeoutError.prototype);
    }
}

export default function fetchWithTimeout(url: RequestInfo, timeoutMs: number, options?: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        let hasSettled = false;
        fetch(url, options).then(
            result => {
                hasSettled = true;
                resolve(result);
            },
            err => {
                hasSettled = true;
                reject(err);
            });

        setTimeout(() => {
            // no need to construct an error when already settled
            if (hasSettled) return;

            const timeStr = timeoutMs < 1000
                ? `${timeoutMs} ms`
                : `${timeoutMs / 1000} sec`;
            reject(new RestTimeoutError(`Request timed out after ${timeStr}: ${url}`));
        }, timeoutMs);
    });
}
