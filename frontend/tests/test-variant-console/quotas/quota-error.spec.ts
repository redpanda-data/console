/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * The existing quota empty-state test only verifies a bare "table renders" — it does
 * not distinguish between "no quotas configured" and "backend error". That's a silent
 * data-loss UX gap. This spec asserts the error path renders a distinct error UI.
 */

import { expect, test } from '@playwright/test';

import { mockConnectError, rpcUrl } from '../../shared/connect-mock';

const QUOTA_SERVICE = 'redpanda.api.dataplane.v1.QuotaService';

test.describe('Quotas page - Connect error handling', () => {
  test('ListQuotas INTERNAL renders an error state, not a silent empty table', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(QUOTA_SERVICE, 'ListQuotas'),
      code: 'internal',
      message: 'mocked backend failure',
    });

    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });

    // Structural: the Quotas heading must still render (chrome doesn't depend on the RPC).
    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    // Structural regression guard: the page must NOT show quota data rows.
    const rowsWithData = page.getByRole('row').filter({ hasText: 'MiB' });
    await expect(rowsWithData).toHaveCount(0);

    // Error UI: QuotasList renders a Chakra Alert (role="alert") containing the ConnectError
    // message when the failure is not permission-related. ConnectError stringifies as
    // "[<code>] <rawMessage>", so the mocked rawMessage is the deterministic substring to assert.
    // Timeout accommodates the query-client's exponential-backoff retry policy for Code.Internal
    // (4 attempts: 0, 1s, 2s, 4s — see src/query-client.ts).
    await expect(page.getByRole('alert')).toContainText('mocked backend failure', { timeout: 30_000 });
  });

  test('ListQuotas PERMISSION_DENIED surfaces a permission message (not a raw gRPC code)', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(QUOTA_SERVICE, 'ListQuotas'),
      code: 'permission_denied',
      message: 'requires PERMISSION_VIEW',
    });

    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    // Structural: raw "permission_denied" machine identifier must not leak to user.
    await expect(page.locator('body')).not.toContainText('permission_denied');

    // QuotasList branches on error.message.includes('permission'|'forbidden') and renders
    // a 403 ResultHttpError with a fixed user-facing message — assert both the status code
    // and the human-readable copy that appears in its place.
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not allowed to view this page/i)).toBeVisible();
  });
});
