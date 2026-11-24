import { mockConnectError, rpcUrl } from '../../shared/connect-mock';
import { expect, test } from '../../shared/e2e';

const QUOTA_SERVICE = 'redpanda.api.dataplane.v1.QuotaService';

test.describe('quotas page - Connect error handling', () => {
  test('listQuotas INTERNAL renders an error state, not a silent empty table', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(QUOTA_SERVICE, 'ListQuotas'),
      code: 'internal',
      message: 'mocked backend failure',
    });

    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    const rowsWithData = page.getByRole('row').filter({ hasText: 'MiB' });
    await expect(rowsWithData).toHaveCount(0);

    // WARNING: The query retries internal errors before rendering the alert; this wait includes its retry backoff.
    await expect(page.getByRole('alert')).toContainText('mocked backend failure', { timeout: 30_000 });
  });

  test('listQuotas PERMISSION_DENIED surfaces a permission message (not a raw gRPC code)', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(QUOTA_SERVICE, 'ListQuotas'),
      code: 'permission_denied',
      message: 'requires PERMISSION_VIEW',
    });

    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('body')).not.toContainText('permission_denied');

    await expect(page.getByRole('heading', { name: '403' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not allowed to view this page/iu)).toBeVisible();
  });
});
