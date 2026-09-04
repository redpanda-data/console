import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the login page. The OSS variant has no authentication
 * configured, so /login redirects to /overview — that redirect is itself the
 * contract worth guarding, since it is what NoneAuthComponent does.
 *
 * The credential form is exercised by the enterprise variant's auth.setup.ts,
 * which is the gate for every enterprise spec.
 */
const OVERVIEW_URL = /\/overview/;

test.describe('Login', () => {
  test('sends an unauthenticated variant straight to the overview', async ({ page }) => {
    await page.goto('/login');

    await page.waitForURL(OVERVIEW_URL, { timeout: 30_000 });
    await expect(page.getByText('Cluster Status', { exact: true })).toBeVisible();
  });

  test('the login callback route renders its progress state', async ({ page }) => {
    // No provider handshake happens here; the page renders "Completing login..."
    // before its fetch resolves, which is the piece a re-skin can break.
    await page.goto('/login/callbacks/oidc');

    await expect(page.getByText('Completing login...')).toBeVisible({ timeout: 10_000 });
  });
});
