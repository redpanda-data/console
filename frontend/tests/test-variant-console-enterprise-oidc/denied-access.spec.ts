/**
 * Tests that a user with no matching group binding is denied access.
 *
 * Unlike admin/viewer tests, this does NOT use a pre-authenticated storage
 * state. It performs a fresh OIDC login with a user whose groups don't
 * match any groupBinding, then verifies access is denied.
 */
import { expect, test } from '@playwright/test';
import { TEST_PASSWORD } from '../shared/zitadel-setup.mjs';

test.describe('Denied access (no matching group binding)', () => {
  test('user with unmatched groups is denied after OIDC login', async ({ page }) => {
    // Navigate to Console login page
    await page.goto('/', { waitUntil: 'networkidle' });

    // Click OIDC login
    const oidcButton = page.getByRole('link', { name: /log in with oidc/i });
    await oidcButton.waitFor({ state: 'visible', timeout: 30_000 });
    await oidcButton.click();

    // Login as denied-user (no roles assigned, no matching groupBinding)
    await page.waitForURL(url => url.toString().includes('/ui/login/') || url.toString().includes('/ui/v2/login/'), { timeout: 30_000 });

    const loginNameInput = page.getByLabel(/loginname/i).first();
    await loginNameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await loginNameInput.fill('denied-user');
    await page.getByRole('button', { name: /continue|next/i }).click();

    const passwordInput = page.getByLabel(/password/i);
    await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /continue|next/i }).click();

    // Handle any intermediate Zitadel screens (MFA setup, consent, etc.)
    await page.waitForTimeout(1_000);

    // Skip 2-Factor Setup if prompted
    const skipButton = page.getByRole('button', { name: /skip/i });
    if (await skipButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipButton.click();
    }

    // After OIDC callback, Console should either:
    // 1. Redirect to /login with an error (token_exchange_failed, etc.)
    // 2. Show permission denied on any page the user tries to access
    // Wait for the redirect back to Console
    await page.waitForURL('**/*', { timeout: 30_000 });

    // Try navigating to topics - should get permission denied
    await page.goto('/topics');
    await page.waitForLoadState('networkidle');

    // The user should see either:
    // - An error/unauthorized message
    // - Be redirected to the login page
    // - See an empty state with permission denied
    const currentURL = page.url();
    const hasError =
      currentURL.includes('error_code') ||
      currentURL.includes('login') ||
      (await page.getByText(/permission denied|unauthorized|not authorized|forbidden/i)
        .isVisible({ timeout: 5_000 })
        .catch(() => false));

    expect(hasError).toBeTruthy();
  });

  test('unauthenticated user cannot access topics', async ({ page }) => {
    // Directly navigate to topics without any authentication
    const response = await page.goto('/topics');
    await page.waitForLoadState('networkidle');

    // Should be redirected to login page or show login form
    const currentURL = page.url();
    const isOnLoginPage =
      currentURL.includes('login') ||
      (await page.getByRole('link', { name: /log in with oidc/i })
        .isVisible({ timeout: 5_000 })
        .catch(() => false));

    expect(isOnLoginPage).toBeTruthy();
  });
});
