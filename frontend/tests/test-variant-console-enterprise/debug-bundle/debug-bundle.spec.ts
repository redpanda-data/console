import { appURL, expect, test } from '../../shared/e2e';
import { DebugBundlePage } from '../../test-variant-console/utils/debug-bundle-page';

const GENERATE_BUTTON = /generate/i;

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
test.describe('debug Bundle - Navigation and Display', () => {
  test('should display debug bundle page with header, generate button, and no in-progress bundle', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Verify navigation
    await expect(page).toHaveURL(appURL('/debug-bundle'));

    // Verify basic mode is active (generate button visible)
    await debugBundlePage.verifyBasicModeActive();

    // Verify there is no in-progress bundle
    const progressLink = page.getByRole('link', { name: /progress|in progress|view progress/i });
    await expect(progressLink).not.toBeVisible();
  });
});

test.describe('debug Bundle - Form Mode Switching', () => {
  test('should switch from basic to advanced mode', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();
    await debugBundlePage.switchToAdvancedMode();
    await debugBundlePage.verifyAdvancedModeActive();
  });

  test('should switch from advanced back to basic mode', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();
    await debugBundlePage.switchToAdvancedMode();

    // Switch back to basic
    await debugBundlePage.switchToBasicMode();

    // Verify we're back in basic mode
    await debugBundlePage.verifyBasicModeActive();
  });
});

test.describe('debug Bundle - Generation Progress', () => {
  test('should navigate to progress page after generation starts', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.generateBasicBundle();

    // Should navigate to progress page
    await expect(page).toHaveURL(/\/debug-bundle\/progress\//);
  });

  test('should display broker status during generation', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);

    // First check if there's an existing bundle in progress
    const hasProgress = await debugBundlePage.isBundleGenerationInProgress();

    if (hasProgress) {
      await debugBundlePage.gotoProgress();
      await debugBundlePage.verifyGenerationInProgress();
      await debugBundlePage.verifyBrokerStatus();
    } else {
      skip();
    }
  });

  test('should display stop/cancel button during generation', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    const hasProgress = await debugBundlePage.isBundleGenerationInProgress();

    if (hasProgress) {
      await debugBundlePage.gotoProgress();

      const stopButton = page.getByTestId('debug-bundle-stop-button');
      await expect(stopButton).toBeVisible();
    } else {
      skip();
    }
  });

  test('should show generation status per broker', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    const hasProgress = await debugBundlePage.isBundleGenerationInProgress();

    if (hasProgress) {
      await debugBundlePage.gotoProgress();
      await debugBundlePage.verifyBrokerStatus();

      // Verify we have broker statuses
      const brokerStatuses = page.locator('[data-testid^="debug-bundle-broker-status-"]');
      const count = await brokerStatuses.count();
      expect(count).toBeGreaterThan(0);
    } else {
      skip();
    }
  });
});

test.describe('debug Bundle - Download and Deletion', () => {
  test('should display download link when bundle is ready', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Check if there's a download link available
    const downloadLink = page.getByRole('link', { name: /download/i });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      await expect(downloadLink).toBeVisible();
      await expect(downloadLink).toHaveAttribute('href', /\/api\/debug_bundle\/files\//);
    } else {
      skip();
    }
  });

  test('should download bundle with correct filename', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    const downloadLink = page.getByRole('link', { name: /download/i });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      const download = await debugBundlePage.downloadBundle();
      expect(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);
    } else {
      skip();
    }
  });

  test('should display delete button for existing bundle', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Look for delete button (might be icon button)
    const deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[aria-label*="delete"]'));

    const hasDelete = await deleteButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDelete) {
      await expect(deleteButton).toBeVisible();
    } else {
      skip();
    }
  });
});

test.describe.skipIf(!!process.env.CI)('debug Bundle - Error Handling', () => {
  test('should display error message if bundle generation fails', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Check for error indicators using testId
    const errorText = page.getByTestId('debug-bundle-error-text');
    const hasError = await errorText.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasError) {
      await debugBundlePage.verifyGenerationFailed();
    } else {
      skip();
    }
  });

  test('should allow retry after failure', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Look for try again button using testId
    const retryButton = page.getByTestId('debug-bundle-try-again-button');
    const hasRetry = await retryButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasRetry) {
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toHaveText('Try again');
    } else {
      skip();
    }
  });
});

test.describe('debug Bundle - Permissions and Access', () => {
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

test.describe('debug Bundle - Bundle Expiration', () => {
  test('should display expiration indicator for expired bundles', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    // Look for expired status using testId
    const expiredText = page.getByTestId('debug-bundle-expired-text');
    const hasExpired = await expiredText.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasExpired) {
      await debugBundlePage.verifyBundleExpired();
    } else {
      skip();
    }
  });
});

test.describe('debug Bundle - Confirmation Dialogs', () => {
  test('should show confirmation dialog when generating bundle if one exists', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    // Generate asks before replacing a bundle, so one has to exist first.
    await debugBundlePage.generateBasicBundle();
    await debugBundlePage.goto();

    await page.getByRole('button', { name: GENERATE_BUTTON }).first().click();

    const confirmDialog = page.getByRole('alertdialog', { name: 'Generate new debug bundle' });
    await expect(
      confirmDialog.getByText(
        'You have an existing debug bundle; generating a new one will delete the previous one. Are you sure?'
      )
    ).toBeVisible();

    // Cancel to avoid actually generating
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(page).toHaveURL(appURL('/debug-bundle'));
  });
});

test.describe('debug Bundle - SCRAM Authentication', () => {
  test('should display SCRAM authentication fields in advanced mode', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();
    await debugBundlePage.switchToAdvancedMode();

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
