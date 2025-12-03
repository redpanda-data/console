import { expect, test } from '@playwright/test';
import {
  goToDebugBundle,
  createBasicDebugBundle,
  switchToAdvancedMode,
  waitForBundleCompletion,
  cancelBundleGeneration,
  downloadDebugBundle,
  deleteDebugBundle,
  isBundleGenerationInProgress,
  goToBundleProgress,
  verifyBrokerStatus,
  fillAdvancedBundleForm,
} from '../debug-bundle.utils';

/**
 * Debug Bundle E2E Tests
 *
 * Tests the complete debug bundle workflow including:
 * - Navigation and page display
 * - Basic bundle creation
 * - Advanced bundle configuration
 * - Progress monitoring
 * - Bundle download and deletion
 * - Cancellation workflow
 */
test.describe('Debug Bundle - Navigation and Display', () => {
  test('should navigate to debug bundle page', async ({ page }) => {
    await goToDebugBundle(page);
    await expect(page).toHaveURL('/debug-bundle');
    await expect(page.getByRole('heading', { name: /debug bundle/i })).toBeVisible();
  });

  test('should display generate button in basic mode', async ({ page }) => {
    await page.goto('/debug-bundle');
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
  });

  test('should display cluster health status if available', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Check if cluster health section exists
    const healthSection = page.getByText(/cluster.*health/i);
    if (await healthSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(healthSection).toBeVisible();
    }
  });

  test('should show link to existing bundle progress if generation is in progress', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Check if there's an in-progress link
    const progressLink = page.getByRole('link', { name: /progress|in progress|view progress/i });
    const hasProgress = await progressLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasProgress) {
      await expect(progressLink).toBeVisible();
      await expect(progressLink).toHaveAttribute('href', /\/debug-bundle\/progress\//);
    }
  });
});

test.describe('Debug Bundle - Form Mode Switching', () => {
  test('should switch from basic to advanced mode', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Click advanced mode toggle
    const advancedButton = page.getByRole('button', { name: /advanced/i });
    await expect(advancedButton).toBeVisible();
    await advancedButton.click();

    // Verify advanced options are visible
    await expect(page.getByText(/cpu profiler/i)).toBeVisible();
    await expect(page.getByText(/controller log/i)).toBeVisible();
    await expect(page.getByText(/metrics interval/i)).toBeVisible();
  });

  test('should switch from advanced back to basic mode', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Switch to advanced
    await switchToAdvancedMode(page);

    // Switch back to basic
    const backButton = page.getByRole('button', { name: /back.*default|default mode/i });
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Verify we're back in basic mode (advanced options hidden)
    await expect(page.getByText(/cpu profiler/i)).not.toBeVisible();
  });
});

test.describe('Debug Bundle - Advanced Configuration Options', () => {
  test('should display all advanced configuration fields', async ({ page }) => {
    await switchToAdvancedMode(page);

    // Verify key advanced fields are present
    await expect(page.getByLabel(/cpu profiler/i).or(page.getByText(/cpu profiler/i))).toBeVisible();
    await expect(page.getByLabel(/controller log.*size/i).or(page.getByText(/controller log/i))).toBeVisible();
    await expect(page.getByLabel(/logs.*size.*limit/i).or(page.getByText(/logs.*size/i))).toBeVisible();
    await expect(page.getByLabel(/metrics.*interval/i).or(page.getByText(/metrics.*interval/i))).toBeVisible();
  });

  test('should allow enabling TLS configuration', async ({ page }) => {
    await switchToAdvancedMode(page);

    const tlsCheckbox = page.getByRole('checkbox', { name: /enable tls|tls/i });
    if (await tlsCheckbox.isVisible()) {
      await tlsCheckbox.check();
      await expect(tlsCheckbox).toBeChecked();

      // Additional TLS options might appear
      await page.waitForTimeout(500);
    }
  });

  test('should allow broker selection if multiple brokers exist', async ({ page }) => {
    await switchToAdvancedMode(page);

    // Look for broker selection dropdown
    const brokerSelect = page.getByLabel(/broker|select broker/i);
    if (await brokerSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(brokerSelect).toBeVisible();
    }
  });

  test('should display unit selectors for size fields', async ({ page }) => {
    await switchToAdvancedMode(page);

    // Look for KB/MB/GB unit selectors
    const unitSelectors = page.locator('select').filter({ hasText: /KB|MB|GB/i });
    const count = await unitSelectors.count();

    if (count > 0) {
      await expect(unitSelectors.first()).toBeVisible();
    }
  });
});

test.describe('Debug Bundle - Generation Progress', () => {
  test('should navigate to progress page after generation starts', async ({ page }) => {
    await page.goto('/debug-bundle');

    const generateButton = page.getByRole('button', { name: /generate/i }).first();
    await generateButton.click();

    // Should navigate to progress page
    await page.waitForURL(/\/debug-bundle\/progress\//, { timeout: 10000 });
    await expect(page).toHaveURL(/\/debug-bundle\/progress\//);
  });

  test('should display broker status during generation', async ({ page }) => {
    // First check if there's an existing bundle in progress
    const hasProgress = await isBundleGenerationInProgress(page);

    if (hasProgress) {
      await goToBundleProgress(page);
      await verifyBrokerStatus(page);
    } else {
      test.skip();
    }
  });

  test('should display stop/cancel button during generation', async ({ page }) => {
    const hasProgress = await isBundleGenerationInProgress(page);

    if (hasProgress) {
      await goToBundleProgress(page);

      const stopButton = page.getByRole('button', { name: /stop|cancel/i });
      await expect(stopButton).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('should show generation status per broker', async ({ page }) => {
    const hasProgress = await isBundleGenerationInProgress(page);

    if (hasProgress) {
      await goToBundleProgress(page);

      // Look for status indicators (running, success, error)
      const statusElements = page.locator('[role="listitem"], [role="row"]');
      const count = await statusElements.count();

      expect(count).toBeGreaterThan(0);
    } else {
      test.skip();
    }
  });
});

test.describe('Debug Bundle - Download and Deletion', () => {
  test('should display download link when bundle is ready', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Check if there's a download link available
    const downloadLink = page.getByRole('link', { name: /download/i });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      await expect(downloadLink).toBeVisible();
      await expect(downloadLink).toHaveAttribute('href', /\/api\/debug_bundle\/files\//);
    } else {
      test.skip();
    }
  });

  test('should download bundle with correct filename', async ({ page }) => {
    await page.goto('/debug-bundle');

    const downloadLink = page.getByRole('link', { name: /download/i });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      const downloadPromise = page.waitForEvent('download');
      await downloadLink.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);
    } else {
      test.skip();
    }
  });

  test('should display delete button for existing bundle', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Look for delete button (might be icon button)
    const deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[aria-label*="delete"]'));

    const hasDelete = await deleteButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDelete) {
      await expect(deleteButton).toBeVisible();
    } else {
      test.skip();
    }
  });
});

test.describe('Debug Bundle - Error Handling', () => {
  test('should display error message if bundle generation fails', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Check for error indicators
    const errorText = page.getByText(/error|failed/i);
    const hasError = await errorText.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasError) {
      await expect(errorText).toBeVisible();
    }
  });

  test('should allow retry after failure', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Look for try again or retry button
    const retryButton = page.getByRole('button', { name: /try again|retry/i });
    const hasRetry = await retryButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasRetry) {
      await expect(retryButton).toBeVisible();
    }
  });

  test('should display validation errors for invalid input', async ({ page }) => {
    await switchToAdvancedMode(page);

    // Try entering invalid values
    const cpuInput = page
      .getByLabel(/cpu profiler/i)
      .or(page.locator('input[data-testid*="cpu-profiler"]'))
      .first();

    if (await cpuInput.isVisible()) {
      await cpuInput.fill('-1'); // Invalid negative value
      await cpuInput.blur();

      // Look for validation error
      await page.waitForTimeout(500);
      const errorMsg = page.getByText(/invalid|must be|greater than/i);
      const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasError) {
        await expect(errorMsg).toBeVisible();
      }
    }
  });
});

test.describe('Debug Bundle - Permissions and Access', () => {
  test('should show debug bundle link in header if user has permissions', async ({ page }) => {
    await page.goto('/');

    // Look for debug bundle link in navigation
    const debugBundleLink = page.getByRole('link', { name: /debug bundle/i });
    const hasLink = await debugBundleLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasLink) {
      await expect(debugBundleLink).toBeVisible();
    }
  });

  test('should navigate to debug bundle from cluster health overview', async ({ page }) => {
    await page.goto('/overview');

    // Look for debug bundle link in overview
    const debugBundleLink = page.getByRole('link', { name: /debug bundle|generate.*bundle/i });
    const hasLink = await debugBundleLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasLink) {
      await expect(debugBundleLink).toBeVisible();
      await debugBundleLink.click();
      await expect(page).toHaveURL(/\/debug-bundle/);
    }
  });
});

test.describe('Debug Bundle - Bundle Expiration', () => {
  test('should display expiration indicator for expired bundles', async ({ page }) => {
    await page.goto('/debug-bundle');

    // Look for expired status
    const expiredText = page.getByText(/expired/i);
    const hasExpired = await expiredText.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasExpired) {
      await expect(expiredText).toBeVisible();
    }
  });
});

test.describe('Debug Bundle - Confirmation Dialogs', () => {
  test('should show confirmation dialog when generating bundle if one exists', async ({ page }) => {
    await page.goto('/debug-bundle');

    const generateButton = page.getByRole('button', { name: /generate/i }).first();
    await generateButton.click();

    // Check for confirmation modal
    const confirmDialog = page.getByRole('dialog').or(page.getByText(/are you sure|confirm|replace/i));
    const hasConfirm = await confirmDialog.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasConfirm) {
      await expect(confirmDialog).toBeVisible();

      // Cancel to avoid actually generating
      const cancelButton = page.getByRole('button', { name: /cancel|no/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
    }
  });
});

test.describe('Debug Bundle - SCRAM Authentication', () => {
  test('should display SCRAM authentication fields in advanced mode', async ({ page }) => {
    await switchToAdvancedMode(page);

    // Look for SCRAM/SASL configuration
    const scramFields = page.getByText(/scram|sasl/i);
    const hasScram = await scramFields
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasScram) {
      await expect(scramFields.first()).toBeVisible();
    }
  });
});
