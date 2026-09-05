import { expect, test } from '@playwright/test';

const OVERVIEW_URL = /\/overview/;
const STAT_LABEL = '[data-slot="stat-label"]';
const CLUSTER_STATUS_LABEL = /^Cluster Status$/i;

/**
 * Smoke coverage for the login page. The OSS variant has no authentication
 * configured, so /login redirects to /overview — that redirect is itself the
 * contract worth guarding, since it is what NoneAuthComponent does.
 *
 * The credential form is exercised by the enterprise variant's auth.setup.ts,
 * which is the gate for every enterprise spec. The /login/callbacks/$provider
 * page is deliberately not asserted here: it navigates away as soon as its own
 * fetch settles, so any assertion on its transient state is a race, not a
 * contract.
 */
test.describe('Login', () => {
  test('sends an unauthenticated variant straight to the overview', async ({ page }) => {
    await page.goto('/login');

    await page.waitForURL(OVERVIEW_URL, { timeout: 30_000 });
    await expect(page.locator(STAT_LABEL).filter({ hasText: CLUSTER_STATUS_LABEL })).toHaveCount(1);
  });
});
