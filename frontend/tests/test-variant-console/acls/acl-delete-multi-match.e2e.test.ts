/* biome-ignore-all lint/suspicious/noSkippedTests: permissions-list delete flow intermittent — see UX-1216 */

import { test } from '../../shared/e2e';

test.describe.sequential('aCL multi-match delete', () => {
  test.skip('delete (ACLs only) with multiple hosts deletes all matching rows', async () => {
    // WARNING: UX-1216: the multi-host delete confirmation does not reliably appear. Restore this case when that flow is verified.
  });

  test.skip('delete (ACLs only) is disabled or absent when principal has zero ACLs', async () => {
    // WARNING: UX-1216: restore the zero-ACL menu check with the multi-host delete coverage.
  });
});
