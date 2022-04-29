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

    const requestPromise = fetch(url, options);
    const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
            reject(new RestTimeoutError("Request timed out after " + (timeoutMs / 1000).toFixed(1) + " sec: " + url));
        }, timeoutMs);
    });

    return Promise.race([requestPromise, timeoutPromise]);
}
