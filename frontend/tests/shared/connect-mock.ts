import type { Page, Route } from '@playwright/test';

/**
 * Connect protocol error codes per https://connectrpc.com/docs/protocol#error-codes.
 * These map 1:1 to gRPC status codes and are what @connectrpc/connect-web emits over JSON.
 */
export type ConnectErrorCode =
  | 'canceled'
  | 'unknown'
  | 'invalid_argument'
  | 'deadline_exceeded'
  | 'not_found'
  | 'already_exists'
  | 'permission_denied'
  | 'resource_exhausted'
  | 'failed_precondition'
  | 'aborted'
  | 'out_of_range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data_loss'
  | 'unauthenticated';

export type MockConnectErrorArgs = {
  page: Page;
  urlGlob: string;
  code: ConnectErrorCode;
  message?: string;
  /** Forwarded to page.route — use `times: 1` to only mock the first call. */
  times?: number;
};

export type MockConnectNetworkFailureArgs = {
  page: Page;
  urlGlob: string;
  reason?: 'failed' | 'timedout' | 'connectionrefused';
};

/**
 * Maps a Connect error code to the HTTP status Connect transports use for JSON responses.
 */
function connectCodeToHttpStatus(code: ConnectErrorCode): number {
  switch (code) {
    case 'invalid_argument':
    case 'out_of_range':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'permission_denied':
      return 403;
    case 'not_found':
      return 404;
    case 'already_exists':
    case 'aborted':
      return 409;
    case 'failed_precondition':
      return 412;
    case 'resource_exhausted':
      return 429;
    case 'canceled':
      return 499;
    case 'deadline_exceeded':
      return 504;
    case 'unavailable':
      return 503;
    case 'unimplemented':
      return 501;
    default:
      return 500;
  }
}

/**
 * Fulfills all matching requests with a Connect-JSON error envelope. Since createConnectTransport
 * in src/config.ts and src/federation/console-app.tsx does not opt into useBinaryFormat, requests
 * use `application/json` and responses just need `{ code, message }` plus the correct HTTP status.
 *
 * Note on react-query retries: page.route persists for all matching calls, so retries see the same
 * error. If a test needs to simulate recover-on-retry, use `times: 1` or swap the route mid-test.
 */
/**
 * DEBUG flag for diagnosing mock interception issues. Flip to true while iterating,
 * false before commit. Gated at module level so route handlers log only when we
 * ask them to (no performance hit in normal runs, no process.env dependency).
 */
const DEBUG_CONNECT_MOCK = false;

export async function mockConnectError(args: MockConnectErrorArgs): Promise<void> {
  const { page, urlGlob, code, message = `mocked ${code}`, times } = args;
  if (DEBUG_CONNECT_MOCK) {
    // biome-ignore lint/suspicious/noConsole: diagnostic gated behind DEBUG_CONNECT_MOCK
    console.log(`[connect-mock] registering route glob=${urlGlob} code=${code}`);
  }
  await page.route(
    urlGlob,
    (route) => {
      if (DEBUG_CONNECT_MOCK) {
        const req = route.request();
        // biome-ignore lint/suspicious/noConsole: diagnostic gated behind DEBUG_CONNECT_MOCK
        console.log(
          `[connect-mock] route FIRED url=${req.url()} method=${req.method()} body=${(req.postData() ?? '').slice(0, 200)}`
        );
      }
      return route.fulfill({
        status: connectCodeToHttpStatus(code),
        contentType: 'application/json',
        body: JSON.stringify({ code, message }),
      });
    },
    times === undefined ? undefined : { times }
  );
}

/**
 * Aborts all matching requests with a network-level failure. Use for simulating offline/timeout
 * behavior where no response envelope is sent at all.
 */
export async function mockConnectNetworkFailure(args: MockConnectNetworkFailureArgs): Promise<void> {
  const { page, urlGlob, reason = 'failed' } = args;
  await page.route(urlGlob, (route) => route.abort(reason));
}

/**
 * Returns the URL glob for a Connect RPC. Use instead of hand-writing paths so tests stay
 * readable and the fully-qualified service name is centralized.
 *
 * @example rpcUrl('redpanda.api.dataplane.v1.UserService', 'CreateUser')
 */
export function rpcUrl(fullyQualifiedService: string, method: string): string {
  return `**/${fullyQualifiedService}/${method}`;
}

/**
 * Convenience wrapper around page.route that records request bodies so assertions can verify
 * that the expected RPC was invoked with the expected input.
 */
export async function captureConnectRequests(
  page: Page,
  urlGlob: string
): Promise<{ requests: Array<{ url: string; postData: string | null }>; stop: () => Promise<void> }> {
  const requests: Array<{ url: string; postData: string | null }> = [];
  const handler = async (route: Route) => {
    requests.push({ url: route.request().url(), postData: route.request().postData() });
    await route.continue();
  };
  await page.route(urlGlob, handler);
  return {
    requests,
    stop: () => page.unroute(urlGlob, handler),
  };
}
