import { expect, type Page, test } from '@playwright/test';

/**
 * Navigates to the debug bundle creation page
 */
export const goToDebugBundle = async (page: Page) => {
  return await test.step('Navigate to debug bundle page', async () => {
    await page.goto('/debug-bundle');
    await expect(page.getByRole('heading', { name: /debug bundle/i })).toBeVisible();
  });
};

/**
 * Creates a basic debug bundle with default settings
 */
export const createBasicDebugBundle = async (page: Page) => {
  return await test.step('Create basic debug bundle', async () => {
    await page.goto('/debug-bundle');

    // Click generate button (should be visible in basic mode)
    const generateButton = page.getByRole('button', { name: /generate/i }).first();
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Wait for navigation to progress page
    await page.waitForURL(/\/debug-bundle\/progress\//);
    await expect(page.getByText(/generating/i)).toBeVisible({ timeout: 10000 });
  });
};

/**
 * Switches to advanced form mode
 */
export const switchToAdvancedMode = async (page: Page) => {
  return await test.step('Switch to advanced form mode', async () => {
    await page.goto('/debug-bundle');

    // Look for advanced mode toggle button
    const advancedButton = page.getByRole('button', { name: /advanced/i });
    await expect(advancedButton).toBeVisible();
    await advancedButton.click();

    // Verify advanced options are visible
    await expect(page.getByText(/cpu profiler/i)).toBeVisible();
  });
};

/**
 * Waits for debug bundle generation to complete or fail
 * @param page Playwright page
 * @param timeout Maximum time to wait in ms (default 60s)
 */
export const waitForBundleCompletion = async (page: Page, timeout = 60000) => {
  return await test.step('Wait for bundle generation to complete', async () => {
    // Wait for either success message, download link, or error
    await Promise.race([
      page.getByText(/complete|success|ready/i).waitFor({ timeout }),
      page.getByText(/download/i).waitFor({ timeout }),
      page.getByText(/error|failed/i).waitFor({ timeout }),
    ]);
  });
};

/**
 * Cancels an in-progress bundle generation
 */
export const cancelBundleGeneration = async (page: Page) => {
  return await test.step('Cancel bundle generation', async () => {
    // Look for stop/cancel button
    const stopButton = page.getByRole('button', { name: /stop|cancel/i });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Confirm if there's a confirmation dialog
    const confirmButton = page.getByRole('button', { name: /confirm|yes|stop/i });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for cancellation to be processed
    await page.waitForTimeout(1000);
  });
};

/**
 * Downloads the generated debug bundle
 */
export const downloadDebugBundle = async (page: Page) => {
  return await test.step('Download debug bundle', async () => {
    // Wait for download link to be available
    const downloadLink = page.getByRole('link', { name: /download/i });
    await expect(downloadLink).toBeVisible({ timeout: 5000 });

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');
    await downloadLink.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);

    return download;
  });
};

/**
 * Deletes the debug bundle file
 */
export const deleteDebugBundle = async (page: Page) => {
  return await test.step('Delete debug bundle', async () => {
    // Look for delete button (usually an icon button)
    const deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[aria-label*="delete"]'));

    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm deletion if modal appears
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for deletion to complete
    await expect(page.getByText(/deleted|removed/i)).toBeVisible({ timeout: 5000 });
  });
};

/**
 * Checks if debug bundle generation is in progress
 */
export const isBundleGenerationInProgress = async (page: Page): Promise<boolean> => {
  await page.goto('/debug-bundle');

  // Check for progress link or in-progress indicator
  const progressLink = page.getByRole('link', { name: /progress|in progress/i });
  return progressLink.isVisible({ timeout: 2000 }).catch(() => false);
};

/**
 * Navigates to bundle generation progress page if one exists
 */
export const goToBundleProgress = async (page: Page) => {
  return await test.step('Navigate to bundle progress', async () => {
    await page.goto('/debug-bundle');

    const progressLink = page.getByRole('link', { name: /progress|view progress|in progress/i });
    await expect(progressLink).toBeVisible();
    await progressLink.click();

    await expect(page).toHaveURL(/\/debug-bundle\/progress\//);
  });
};

/**
 * Verifies broker status display on progress page
 */
export const verifyBrokerStatus = async (page: Page) => {
  return await test.step('Verify broker status display', async () => {
    // Should be on progress page
    await expect(page).toHaveURL(/\/debug-bundle\/progress\//);

    // Look for broker status items (could be in list or table)
    const brokerStatus = page.locator('[role="listitem"]').or(page.locator('[role="row"]'));
    await expect(brokerStatus.first()).toBeVisible({ timeout: 5000 });
  });
};

/**
 * Fills advanced debug bundle form with custom options
 */
export const fillAdvancedBundleForm = async (
  page: Page,
  options: {
    cpuProfilerSeconds?: number;
    controllerLogSizeMB?: number;
    logsSizeLimitMB?: number;
    metricsIntervalSeconds?: number;
    enableTLS?: boolean;
  }
) => {
  return await test.step('Fill advanced bundle form', async () => {
    await switchToAdvancedMode(page);

    if (options.cpuProfilerSeconds !== undefined) {
      const cpuInput = page.getByLabel(/cpu profiler/i).or(page.locator('input[data-testid*="cpu-profiler"]'));
      await cpuInput.fill(String(options.cpuProfilerSeconds));
    }

    if (options.controllerLogSizeMB !== undefined) {
      const logSizeInput = page
        .getByLabel(/controller log.*size/i)
        .or(page.locator('input[data-testid*="controller-log-size"]'));
      await logSizeInput.fill(String(options.controllerLogSizeMB));
    }

    if (options.logsSizeLimitMB !== undefined) {
      const logsLimitInput = page
        .getByLabel(/logs.*size.*limit/i)
        .or(page.locator('input[data-testid*="logs-size-limit"]'));
      await logsLimitInput.fill(String(options.logsSizeLimitMB));
    }

    if (options.metricsIntervalSeconds !== undefined) {
      const metricsInput = page
        .getByLabel(/metrics.*interval/i)
        .or(page.locator('input[data-testid*="metrics-interval"]'));
      await metricsInput.fill(String(options.metricsIntervalSeconds));
    }

    if (options.enableTLS !== undefined) {
      const tlsCheckbox = page.getByRole('checkbox', { name: /enable tls|tls/i });
      if (options.enableTLS) {
        await tlsCheckbox.check();
      } else {
        await tlsCheckbox.uncheck();
      }
    }
  });
};
