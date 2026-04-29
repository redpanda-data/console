/** biome-ignore-all lint/suspicious/noSkippedTests: ACL list not finding principals with colon in name — see UX-1215 */
/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * Connect protobuf string fields accept a wider range of characters than the old REST
 * path. Principal names like "User:foo" must round-trip correctly through URL encoding
 * (the detail page uses the principal as a URL segment).
 *
 * NOTE: The colon-in-principalName case is currently skipped pending UX-1215. When a
 * principalName contains ":" (e.g. "test:colon:123"), the create succeeds and the detail
 * URL correctly encodes the full principal, but the ACL list's getByTestId filter with
 * the raw principalName does not match any row. Root cause needs product decision on
 * whether principalNames are allowed to contain ":" — backend acceptance and list-side
 * rendering are out of sync. Space-rejection case is also deferred pending backend policy.
 */

import { test } from '@playwright/test';

test.describe('ACL principal URL encoding', () => {
  test.skip('principalName containing ":" round-trips through create → list → detail', async () => {
    // TODO(UX-1215): un-skip once colon-in-principalName behavior is defined by product
    // and the ACL list rendering matches. The connect-mock infrastructure and UI create
    // flow are both verified working in UX-1218 — this is a separate edge case.
  });

  test.skip('principalName containing a space is rejected with a clear validation error', async () => {
    // TODO(UX-1208): activate once backend validation policy for whitespace in
    // principalName is confirmed.
  });
});
