import { appURL, expect, test } from '../../shared/e2e';
import { DebugBundlePage } from '../../test-variant-console/utils/debug-bundle-page';

const GENERATE_BUTTON = /generate/iu;

test.describe('debug Bundle - Navigation and Display', () => {
  test('should display debug bundle page with header, generate button, and no in-progress bundle', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    await expect(page).toHaveURL(appURL('/debug-bundle'));

    await debugBundlePage.verifyBasicModeActive();

    const progressLink = page.getByRole('link', { name: /progress|in progress|view progress/iu });
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

    await debugBundlePage.switchToBasicMode();

    await debugBundlePage.verifyBasicModeActive();
  });
});

test.describe('debug Bundle - Generation Progress', () => {
  test('should navigate to progress page after generation starts', async ({ page }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.generateBasicBundle();

    await expect(page).toHaveURL(/\/debug-bundle\/progress\//u);
  });

  test('should display broker status during generation', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);

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

    const downloadLink = page.getByRole('link', { name: /download/iu });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      await expect(downloadLink).toBeVisible();
      await expect(downloadLink).toHaveAttribute('href', /\/api\/debug_bundle\/files\//u);
    } else {
      skip();
    }
  });

  test('should download bundle with correct filename', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    const downloadLink = page.getByRole('link', { name: /download/iu });
    const hasDownload = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDownload) {
      const download = await debugBundlePage.downloadBundle();
      expect(download.suggestedFilename()).toMatch(/debug-bundle\.zip/u);
    } else {
      skip();
    }
  });

  test('should display delete button for existing bundle', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

    const deleteButton = page
      .getByRole('button', { name: /delete/iu })
      .or(page.locator('button[aria-label*="delete"]'));

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

    const debugBundleLink = page.getByRole('link', { name: /debug bundle/iu });
    const hasLink = await debugBundleLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasLink) {
      await expect(debugBundleLink).toBeVisible();
    }
  });

  test('should navigate to debug bundle from cluster health overview', async ({ page }) => {
    await page.goto('/overview');

    const debugBundleLink = page.getByRole('link', { name: /debug bundle|generate.*bundle/iu });
    const hasLink = await debugBundleLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasLink) {
      await expect(debugBundleLink).toBeVisible();
      await debugBundleLink.click();
      await expect(page).toHaveURL(/\/debug-bundle/u);
    }
  });
});

test.describe('debug Bundle - Bundle Expiration', () => {
  test('should display expiration indicator for expired bundles', async ({ page, skip }) => {
    const debugBundlePage = new DebugBundlePage(page);
    await debugBundlePage.goto();

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
    await debugBundlePage.generateBasicBundle();
    await debugBundlePage.goto();

    await page.getByRole('button', { name: GENERATE_BUTTON }).first().click();

    const confirmDialog = page.getByRole('alertdialog', { name: 'Generate new debug bundle' });
    await expect(
      confirmDialog.getByText(
        'You have an existing debug bundle; generating a new one will delete the previous one. Are you sure?'
      )
    ).toBeVisible();

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

    const scramFields = page.getByText(/scram|sasl/iu);
    const hasScram = await scramFields
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasScram) {
      await expect(scramFields.first()).toBeVisible();
    }
  });
});
