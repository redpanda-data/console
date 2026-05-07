import { expect, type Page } from '@playwright/test';
import { TEST_PASSWORD } from '../shared/zitadel-setup.mjs';

/**
 * Perform an OIDC login flow through Zitadel for the given user.
 *
 * Navigates to Console, clicks the OIDC login button, enters credentials
 * in Zitadel's login page, handles any intermediate screens (MFA skip),
 * and waits for the redirect back to Console's overview page.
 */
export async function loginViaOIDC(page: Page, username: string): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Click the OIDC login button - this redirects to Zitadel
  const oidcButton = page.getByRole('link', { name: /log in with oidc/i });
  await oidcButton.waitFor({ state: 'visible', timeout: 30_000 });
  await oidcButton.click();

  // Wait for Zitadel's login page to load
  await page.waitForURL(
    (url) => url.toString().includes('/ui/login/') || url.toString().includes('/ui/v2/login/'),
    { timeout: 30_000 },
  );

  // Enter loginname
  const loginNameInput = page.getByLabel(/loginname/i).first();
  await loginNameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await loginNameInput.fill(username);
  await page.getByRole('button', { name: /continue|next/i }).click();

  // Enter password
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

  // After login completes, Zitadel redirects back to Console's callback URL,
  // which then redirects to /overview.
  await page.waitForURL('**/overview**', { timeout: 30_000 });
  await expect(page.getByTestId('versionTitle')).toBeVisible({ timeout: 30_000 });
}
