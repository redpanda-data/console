import type { Download, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * Page Object Model for Debug Bundle pages
 * Handles creation, progress monitoring, and bundle management
 */
export class DebugBundlePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigation methods
   */
  async goto() {
    await this.page.goto('/debug-bundle');
    await expect(this.page.getByRole('heading', { name: /debug bundle/i })).toBeVisible();
  }

  async gotoProgress(bundleId?: string) {
    if (bundleId) {
      await this.page.goto(`/debug-bundle/progress/${bundleId}`);
    } else {
      await this.page.goto('/debug-bundle');
      const progressLink = this.page.getByRole('link', { name: /progress|view progress|in progress/i });
      await expect(progressLink).toBeVisible();
      await progressLink.click();
    }
    await expect(this.page).toHaveURL(/\/debug-bundle\/progress\//);
  }

  async waitForProgressPage() {
    await this.page.waitForURL(/\/debug-bundle\/progress\//);
  }

  /**
   * Mode switching
   */
  async switchToAdvancedMode() {
    const advancedButton = this.page.getByTestId('switch-to-custom-debug-bundle-form');
    await advancedButton.click();

    // Verify advanced options are visible
    await expect(
      this.page.getByText(
        /This is an advanced feature, best used if you have received direction to do so from Redpanda support./i
      )
    ).toBeVisible();
  }

  async switchToBasicMode() {
    const basicButton = this.page.getByTestId('switch-to-basic-debug-bundle-form');
    if (await basicButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await basicButton.click();
    }
  }

  /**
   * Form input methods
   */
  async setCpuProfilerSeconds(seconds: number) {
    const cpuInput = this.page.getByLabel(/cpu profiler/i).or(this.page.locator('input[data-testid*="cpu-profiler"]'));
    await cpuInput.fill(String(seconds));
  }

  async setControllerLogSizeMB(sizeMB: number) {
    const logSizeInput = this.page
      .getByLabel(/controller log.*size/i)
      .or(this.page.locator('input[data-testid*="controller-log-size"]'));
    await logSizeInput.fill(String(sizeMB));
  }

  async setLogsSizeLimitMB(sizeMB: number) {
    const logsLimitInput = this.page
      .getByLabel(/logs.*size.*limit/i)
      .or(this.page.locator('input[data-testid*="logs-size-limit"]'));
    await logsLimitInput.fill(String(sizeMB));
  }

  async setMetricsIntervalSeconds(seconds: number) {
    const metricsInput = this.page
      .getByLabel(/metrics.*interval/i)
      .or(this.page.locator('input[data-testid*="metrics-interval"]'));
    await metricsInput.fill(String(seconds));
  }

  async setEnableTLS(enabled: boolean) {
    const tlsCheckbox = this.page.getByRole('checkbox', { name: /enable tls|tls/i });
    if (enabled) {
      await tlsCheckbox.check();
    } else {
      await tlsCheckbox.uncheck();
    }
  }

  /**
   * Advanced form configuration
   */
  async fillAdvancedForm(options: {
    cpuProfilerSeconds?: number;
    controllerLogSizeMB?: number;
    logsSizeLimitMB?: number;
    metricsIntervalSeconds?: number;
    enableTLS?: boolean;
  }) {
    await this.switchToAdvancedMode();

    if (options.cpuProfilerSeconds !== undefined) {
      await this.setCpuProfilerSeconds(options.cpuProfilerSeconds);
    }

    if (options.controllerLogSizeMB !== undefined) {
      await this.setControllerLogSizeMB(options.controllerLogSizeMB);
    }

    if (options.logsSizeLimitMB !== undefined) {
      await this.setLogsSizeLimitMB(options.logsSizeLimitMB);
    }

    if (options.metricsIntervalSeconds !== undefined) {
      await this.setMetricsIntervalSeconds(options.metricsIntervalSeconds);
    }

    if (options.enableTLS !== undefined) {
      await this.setEnableTLS(options.enableTLS);
    }
  }

  /**
   * Bundle generation actions
   */
  async generate(options?: { confirmOverwrite?: boolean }) {
    const generateButton = this.page.getByRole('button', { name: /generate/i }).first();
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Check if confirmation dialog appears
    const confirmDialog = this.page.getByRole('dialog').or(this.page.getByText(/are you sure|confirm|replace/i));
    const hasConfirm = await confirmDialog.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasConfirm) {
      if (options?.confirmOverwrite) {
        // Confirm to proceed with generation
        const confirmButton = this.page.getByRole('button', { name: /confirm|yes|replace/i });
        await confirmButton.click();
      } else {
        // Cancel to avoid generating
        const cancelButton = this.page.getByRole('button', { name: /cancel|no/i });
        await cancelButton.click();
        return; // Exit early since we cancelled
      }
    }

    // Wait for navigation to progress page
    await this.waitForProgressPage();
  }

  async generateBasicBundle() {
    return await test.step('Generate basic debug bundle', async () => {
      await this.goto();
      await this.generate({ confirmOverwrite: true });
      await expect(this.page.getByText(/generating/i)).toBeVisible({ timeout: 10_000 });
    });
  }

  async generateAdvancedBundle(options: {
    cpuProfilerSeconds?: number;
    controllerLogSizeMB?: number;
    logsSizeLimitMB?: number;
    metricsIntervalSeconds?: number;
    enableTLS?: boolean;
  }) {
    return await test.step('Generate advanced debug bundle', async () => {
      await this.goto();
      await this.fillAdvancedForm(options);

      const generateButton = this.page.getByRole('button', { name: /generate/i }).first();
      await expect(generateButton).toBeVisible();
      await generateButton.click();

      await this.waitForProgressPage();
    });
  }

  async cancelGeneration() {
    return await test.step('Cancel debug bundle generation', async () => {
      const stopButton = this.page.getByTestId('debug-bundle-stop-button');
      await expect(stopButton).toBeVisible();
      await stopButton.click();

      // Confirm if there's a confirmation dialog
      const confirmButton = this.page.getByRole('button', { name: /confirm|yes|stop/i });
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      await this.page.waitForTimeout(1000);
    });
  }

  async clickDoneButton() {
    const doneButton = this.page.getByTestId('debug-bundle-done-button');
    await expect(doneButton).toBeVisible();
    await expect(doneButton).toHaveText('Done');
    await doneButton.click();
  }

  async clickTryAgainButton() {
    const tryAgainButton = this.page.getByTestId('debug-bundle-try-again-button');
    await expect(tryAgainButton).toBeVisible();
    await expect(tryAgainButton).toHaveText('Try again');
    await tryAgainButton.click();
  }

  /**
   * Bundle download and deletion
   */
  async downloadBundle(): Promise<Download> {
    const downloadLink = this.page.getByRole('link', { name: /download/i });
    await expect(downloadLink).toBeVisible({ timeout: 5000 });

    const downloadPromise = this.page.waitForEvent('download');
    await downloadLink.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);

    return download;
  }

  async deleteBundle() {
    return await test.step('Delete debug bundle', async () => {
      const deleteButton = this.page
        .getByRole('button', { name: /delete/i })
        .or(this.page.locator('button[aria-label*="delete"]'));

      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      // Confirm deletion if modal appears
      const confirmButton = this.page.getByRole('button', { name: /confirm|yes|delete/i });
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      await expect(this.page.getByText(/deleted|removed/i)).toBeVisible({ timeout: 5000 });
    });
  }

  /**
   * Status checking methods
   */
  async isBundleGenerationInProgress(): Promise<boolean> {
    await this.goto();

    const progressLink = this.page.getByRole('link', { name: /progress|in progress/i });
    return progressLink.isVisible({ timeout: 2000 }).catch(() => false);
  }

  async waitForBundleCompletion(timeout = 60_000) {
    await Promise.race([
      this.page.getByText(/complete|success|ready/i).waitFor({ timeout }),
      this.page.getByText(/download/i).waitFor({ timeout }),
      this.page.getByText(/error|failed/i).waitFor({ timeout }),
    ]);
  }

  /**
   * Validation methods
   */
  async verifyBrokerStatus() {
    await this.page.waitForURL(/\/debug-bundle\/progress\//);

    // Verify the overview component is visible
    const overview = this.page.getByTestId('debug-bundle-overview');
    await expect(overview).toBeVisible({ timeout: 5000 });

    // Verify at least one broker status is visible
    const brokerStatus = this.page.locator('[data-testid^="debug-bundle-broker-status-"]').first();
    await expect(brokerStatus).toBeVisible({ timeout: 5000 });
  }

  async verifyGenerationInProgress() {
    const generatingText = this.page.getByTestId('debug-bundle-generating-text');
    await expect(generatingText).toBeVisible();
    await expect(generatingText).toHaveText('Generating bundle...');
  }

  async verifyGenerationComplete() {
    const completeBox = this.page.getByTestId('debug-bundle-complete-box');
    await expect(completeBox).toBeVisible({ timeout: 60_000 });
  }

  async verifyGenerationFailed() {
    const errorText = this.page.getByTestId('debug-bundle-error-text');
    await expect(errorText).toBeVisible();
    await expect(errorText).toHaveText('Your debug bundle was not generated.');
  }

  async verifyBundleExpired() {
    const expiredText = this.page.getByTestId('debug-bundle-expired-text');
    await expect(expiredText).toBeVisible();
    await expect(expiredText).toHaveText('Your previous bundle has expired and cannot be downloaded.');
  }

  async verifyAdvancedModeActive() {
    await expect(
      this.page.getByText(
        /This is an advanced feature, best used if you have received direction to do so from Redpanda support./i
      )
    ).toBeVisible();
  }

  async verifyBasicModeActive() {
    const generateButton = this.page.getByRole('button', { name: /generate/i }).first();
    await expect(generateButton).toBeVisible();
  }

  /**
   * Verify specific broker status
   */
  async verifyBrokerStatusById(brokerId: number) {
    const brokerStatus = this.page.getByTestId(`debug-bundle-broker-status-${brokerId}`);
    await expect(brokerStatus).toBeVisible();
  }

  async verifyBrokerLabel(brokerId: number) {
    const brokerLabel = this.page.getByTestId(`broker-${brokerId}-label`);
    await expect(brokerLabel).toBeVisible();
    await expect(brokerLabel).toHaveText(`Broker ${brokerId}`);
  }

  async verifyBrokerError(brokerId: number, expectedMessage?: string) {
    const errorLabel = this.page.getByTestId(`broker-${brokerId}-error-label`);
    await expect(errorLabel).toBeVisible();

    if (expectedMessage) {
      const errorMessage = this.page.getByTestId(`broker-${brokerId}-error-message`);
      await expect(errorMessage).toHaveText(expectedMessage);
    }
  }

  async verifyDefaultModeDescription() {
    const description = this.page.getByTestId('debug-bundle-description-default-mode');
    await expect(description).toBeVisible();
    await expect(description).toContainText('Collect environment data');
  }

  async verifyAdvancedModeDescription() {
    const description = this.page.getByTestId('debug-bundle-description-advanced-mode');
    await expect(description).toBeVisible();
    await expect(description).toContainText('Collect environment data');
  }
}
