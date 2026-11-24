import { expect, test } from '../../shared/e2e';

const OVERVIEW_URL = /\/overview/u;
const STAT_LABEL = '[data-slot="stat-label"]';
const CLUSTER_STATUS_LABEL = /^Cluster Status$/iu;

// WARNING: Do not assert on transient callback-page content; it navigates as soon as the login response settles.
test.describe('login', () => {
  test('sends an unauthenticated variant straight to the overview', async ({ page }) => {
    await page.goto('/login');

    await page.waitForURL(OVERVIEW_URL, { timeout: 30_000 });
    await expect(page.locator(STAT_LABEL).filter({ hasText: CLUSTER_STATUS_LABEL })).toHaveCount(1);
  });
});
