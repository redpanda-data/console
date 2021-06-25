

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
