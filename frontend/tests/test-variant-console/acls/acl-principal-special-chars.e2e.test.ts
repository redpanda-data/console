/* biome-ignore-all lint/suspicious/noSkippedTests: ACL list not finding principals with colon in name — see UX-1215 */

import { test } from '../../shared/e2e';

test.describe('aCL principal URL encoding', () => {
  test.skip('principalName containing ":" round-trips through create → list → detail', async () => {
    // WARNING: UX-1215: colon-containing names create successfully but do not match an ACL row. Restore once input policy and list rendering agree.
  });

  test.skip('principalName containing a space is rejected with a clear validation error', async () => {
    // WARNING: UX-1208: restore after the backend contract for whitespace in principal names is verified.
  });
});
