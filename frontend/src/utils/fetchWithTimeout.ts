

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
