/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * After the REST→Connect swap, the /users/:name/details and /acls/:principal/details
 * routes fetch via Connect Query with a different cache key. These specs catch a
 * deep-link regression where the details page breaks when the cache is cold (e.g.
 * bookmarks, share links).
 */

import { expect, test } from '@playwright/test';

const ACLS_HEADING_NAME = /ACLs/;
const CACHE_MISS_ERROR_PATTERN = /cannot read|undefined|missing user/i;

test.describe('Security pages deep-link (cold cache)', () => {
  test('direct-load /security/users/e2euser/details renders without prior list navigation', async ({ page }) => {
    // Collect console/page errors to guard against cache-miss crashes.
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Directly load details URL without visiting /security/users first.
    // e2euser is seeded by tests/seed.spec.ts per the existing test-variant-console stack.
    await page.goto('/security/users/e2euser/details', { waitUntil: 'domcontentloaded' });

    // Structural: page rendered (not an error boundary). The Roles card only renders when the
    // backend's Roles API is available (RBAC/enterprise), so this OSS suite only checks ACLs.
    await expect(page.getByText('Principal:User:e2euser')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: ACLS_HEADING_NAME })).toBeVisible();

    // Guard: no console errors mentioning undefined user / missing data.
    const suspicious = consoleErrors.filter((msg) => CACHE_MISS_ERROR_PATTERN.test(msg));
    expect(suspicious).toEqual([]);
  });

  test('direct-load /security/acls/<principal>/details renders for existing principal', async ({ page }) => {
    test.setTimeout(180_000);

    const principal = `deeplink-${Date.now()}`;
    const topicName = 'deeplink-topic';

    // Seed: grant a topic-read ACL to a fresh principal via the live Permissions List UI
    // flow so the Connect backend has a real entry to fetch.
    await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create ACL' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Add ACL' })).toBeVisible();

    await page.getByPlaceholder('Select or type a user...').fill(principal);
    await page.getByRole('option', { name: `Create "${principal}"` }).click();
    await page.getByPlaceholder('e.g. my-topic').fill(topicName);

    await page.getByLabel('Operation').click();
    await page.getByRole('option', { name: 'Read', exact: true }).click();

    await page.getByRole('button', { name: 'Add ACL' }).click();
    await expect(page.getByRole('dialog', { name: 'Add ACL' })).not.toBeVisible({ timeout: 10_000 });

    // Cold-cache simulation: open a fresh page in a new context so Connect Query has no
    // hydrated `getAclsByPrincipal` entry, then deep-link straight to the detail URL.
    const freshContext = await page.context().browser()?.newContext();
    if (!freshContext) {
      throw new Error('Failed to create fresh browser context');
    }
    const freshPage = await freshContext.newPage();
    try {
      await freshPage.goto(`/security/acls/User:${principal}/details`, { waitUntil: 'domcontentloaded' });

      // Structural: detail page renders the seeded rule without a prior list visit.
      await expect(freshPage.getByTestId('acl-rules-length').first()).toHaveText('ACL rules (1)', {
        timeout: 15_000,
      });
      await expect(freshPage.getByText(`Topics matching: "${topicName}"`)).toBeVisible();
      await expect(freshPage.getByText('Read: allow')).toBeVisible();
    } finally {
      await freshContext.close();
    }
  });
});
