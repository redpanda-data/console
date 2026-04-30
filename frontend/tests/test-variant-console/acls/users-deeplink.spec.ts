/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * After the REST→Connect swap, the /users/:name/details route fetches via Connect
 * Query with a different cache key. This spec catches a deep-link regression where
 * the details page breaks when the list cache is cold (e.g. bookmarks, share links).
 */

import { expect, test } from '@playwright/test';

import {
  ModeCustom,
  OperationTypeAllow,
  ResourcePatternTypeLiteral,
  ResourceTypeTopic,
  type Rule,
} from '../../../src/components/pages/security/shared/acl-model';
import { AclPage } from '../utils/acl-page';

test.describe('Users page deep-link (cold cache)', () => {
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

    // Structural: page rendered (not an error boundary).
    await expect(page.getByRole('heading', { name: 'User: e2euser', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('User information')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /ACLs/ })).toBeVisible();

    // Guard: no console errors mentioning undefined user / missing data.
    // Narrow regex anchored to the cache-miss crash signatures we'd act on; benign
    // Connect Query warnings (e.g. canceled in-flight queries on unmount) won't match.
    const suspicious = consoleErrors.filter((msg) => /cannot read|undefined|missing user/i.test(msg));
    expect(suspicious).toEqual([]);
  });

  test('direct-load /security/acls/<principal>/details renders for existing principal', async ({ page }) => {
    test.setTimeout(180_000);

    const principal = `deeplink-${Date.now()}`;
    const host = '*';
    const seedRule: Rule = {
      id: 0,
      resourceType: ResourceTypeTopic,
      mode: ModeCustom,
      selectorType: ResourcePatternTypeLiteral,
      selectorValue: 'deeplink-topic',
      operations: { READ: OperationTypeAllow },
    };

    const aclPage = new AclPage(page);

    // Seed: create an ACL via the live UI flow so the Connect backend has a real entry to fetch.
    await aclPage.goto();
    await aclPage.setPrincipal(principal);
    await aclPage.setHost(host);
    await aclPage.configureRules([seedRule]);
    await aclPage.submitForm();
    await aclPage.waitForDetailPage();

    // Cold-cache simulation: open a fresh page in a new context so Connect Query has no
    // hydrated `getAclsByPrincipal` entry, then deep-link straight to the detail URL.
    const freshContext = await page.context().browser()?.newContext();
    if (!freshContext) {
      throw new Error('Failed to create fresh browser context');
    }
    const freshPage = await freshContext.newPage();
    try {
      await freshPage.goto(`/security/acls/User:${principal}/details`, { waitUntil: 'domcontentloaded' });

      // Structural: detail page renders rules without a prior list visit. Use a fresh AclPage
      // so validateDetailRule queries the new context, not the original page.
      const freshAclPage = new AclPage(freshPage);
      await expect(freshPage.getByTestId('acl-rules-length').first()).toHaveText('ACL rules (1)', {
        timeout: 15_000,
      });
      await freshAclPage.validateDetailRule(0, seedRule, principal, host);
    } finally {
      await freshContext.close();
    }
  });
});
