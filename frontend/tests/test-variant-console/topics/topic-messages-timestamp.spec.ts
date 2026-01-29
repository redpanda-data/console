// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

test.describe('Filter Messages by Timestamp', () => {
  test('should set timestamp and verify API request with correct parameters', async ({ page }) => {
    const topicName = `timestamp-filter-${Date.now()}`;
    const message = 'Test message for timestamp filter';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await test.step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      // Wait for messages to load
      await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });

      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Timestamp" option
      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      // DateTimeInput should now be visible
      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Set timestamp and verify URL update and API request', async () => {
      // Set a specific timestamp (e.g., 1 hour ago)
      const timestampValue = Date.now() - 60 * 60 * 1000;

      // Find the readonly text input that displays the current datetime
      const dateTimeDisplay = page.getByTestId('start-timestamp-input').getByRole('textbox');
      await expect(dateTimeDisplay).toBeVisible();

      // Click on the readonly input to open the date/time picker
      await dateTimeDisplay.click();

      // Wait a moment for any picker UI to appear
      await page.waitForTimeout(500);

      // Find and fill the time input
      const timeInput = page.getByTestId('start-timestamp-input').locator('input[type="time"]');
      await expect(timeInput).toBeVisible();

      // Convert timestamp to time format (HH:mm)
      const date = new Date(timestampValue);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeValue = `${hours}:${minutes}`;

      // Listen for the API request to ListMessages with startOffset -4 (Timestamp mode)
      const apiRequestPromise = page.waitForRequest((request) => {
        if (
          !request.url().includes('redpanda.api.console.v1alpha1.ConsoleService/ListMessages') ||
          request.method() !== 'POST'
        ) {
          return false;
        }

        // Try to parse the request body to check if it has startOffset -4
        try {
          const postData = request.postData();
          if (!postData) {
            return false;
          }

          // Check if the postData contains the expected fields (as string search)
          return postData.includes('"startOffset":"-4"') && postData.includes('"startTimestamp"');
        } catch {
          return false;
        }
      });

      // Set the time value
      await timeInput.fill(timeValue);

      // Trigger the change by pressing Enter or Tab
      await page.keyboard.press('Enter');

      // Wait for the API request with correct parameters
      const apiRequest = await apiRequestPromise;

      // Verify the request was made
      expect(apiRequest).toBeTruthy();
      expect(apiRequest.url()).toContain('ListMessages');
    });

    await test.step('Verify URL contains timestamp parameter', () => {
      // Verify URL contains the timestamp parameter 't'
      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      // Extract timestamp from URL
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();
      expect(Number(urlTimestamp)).toBeGreaterThan(0);
    });

    await test.step('Verify date input displays a value', async () => {
      // The readonly display input should show the formatted datetime
      const dateTimeDisplay = page.getByTestId('start-timestamp-input').getByRole('textbox');
      const displayValue = await dateTimeDisplay.inputValue();

      // Verify the display value is not empty
      expect(displayValue).toBeTruthy();
      expect(displayValue.length).toBeGreaterThan(0);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should accept unix timestamp in seconds and convert to milliseconds in URL', async ({ page }) => {
    const topicName = `timestamp-unix-${Date.now()}`;
    const message = 'Test message for unix timestamp input';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await test.step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      // Wait for messages to load
      await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });

      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Timestamp" option
      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      // DateTimeInput should now be visible
      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Input unix timestamp in seconds format', async () => {
      // Unix timestamp in seconds (e.g., January 1, 2024, 00:00:00 UTC)
      const timestampInSeconds = 1_704_067_200; // 2024-01-01 00:00:00 UTC
      const timestampInMilliseconds = timestampInSeconds * 1000; // 1704067200000

      // Find the readonly display input and click it to potentially open input mode
      const dateTimeDisplay = page.getByTestId('start-timestamp-input').getByRole('textbox');
      await expect(dateTimeDisplay).toBeVisible();

      // Try to clear and input the unix timestamp directly
      // First, try triple-click to select all
      await dateTimeDisplay.click({ clickCount: 3 });
      await page.keyboard.press('Control+A'); // Select all
      await page.keyboard.press('Meta+A'); // Select all (Mac)

      // Listen for the API request
      const apiRequestPromise = page.waitForRequest((request) => {
        if (
          !request.url().includes('redpanda.api.console.v1alpha1.ConsoleService/ListMessages') ||
          request.method() !== 'POST'
        ) {
          return false;
        }

        try {
          const postData = request.postData();
          if (!postData) {
            return false;
          }

          // Check if the postData contains startOffset -4 and the correct startTimestamp in milliseconds
          return (
            postData.includes('"startOffset":"-4"') &&
            postData.includes(`"startTimestamp":"${timestampInMilliseconds}"`)
          );
        } catch {
          return false;
        }
      });

      // Type the unix timestamp in seconds
      await page.keyboard.type(String(timestampInSeconds));
      await page.keyboard.press('Enter');

      // Wait for the API request with the correct timestamp
      const apiRequest = await apiRequestPromise;

      // Verify the request was made
      expect(apiRequest).toBeTruthy();

      // Verify the postData contains the expected timestamp in milliseconds
      const postData = apiRequest.postData();
      expect(postData).toBeTruthy();
      expect(postData).toContain('"startOffset":"-4"');
      expect(postData).toContain(`"startTimestamp":"${timestampInMilliseconds}"`);

      // Verify URL contains timestamp in milliseconds format
      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      // Extract timestamp from URL
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();

      // Verify the URL timestamp is in milliseconds and matches our expected value
      const urlTimestampValue = Number(urlTimestamp);
      expect(urlTimestampValue).toBe(timestampInMilliseconds);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should remove timestamp parameter from URL when switching to non-timestamp offset type', async ({ page }) => {
    const topicName = `timestamp-url-removal-${Date.now()}`;
    const message = 'Test message for URL parameter removal';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await test.step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      // Wait for messages to load
      await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });

      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Timestamp" option
      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      // DateTimeInput should now be visible
      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify timestamp parameter is added to URL', async () => {
      // Wait for URL to update with timestamp parameter
      await page.waitForURL((url) => url.searchParams.has('t'), { timeout: 5000 });

      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      // Extract and verify timestamp parameter
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();
      expect(Number(urlTimestamp)).toBeGreaterThan(0);
    });

    await test.step('Switch to Latest/Live offset type', async () => {
      // Open the start offset dropdown again
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Latest / Live" option
      const latestOption = page.getByTestId('start-offset-latest-live');
      await expect(latestOption).toBeVisible();
      await latestOption.click();

      // DateTimeInput should no longer be visible
      await expect(page.getByTestId('start-timestamp-input')).not.toBeVisible();
    });

    await test.step('Verify timestamp parameter is removed from URL', async () => {
      // Wait for URL to update and remove timestamp parameter
      await page.waitForURL((url) => !url.searchParams.has('t'), { timeout: 5000 });

      const currentUrl = page.url();
      expect(currentUrl).not.toContain('t=');

      // Verify timestamp parameter is not in URL
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeNull();
    });

    await test.step('Switch to Beginning offset type and verify t parameter remains absent', async () => {
      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await startOffsetDropdown.click();

      // Select "Beginning" option
      const beginningOption = page.getByTestId('start-offset-beginning');
      await expect(beginningOption).toBeVisible();
      await beginningOption.click();

      // Verify timestamp parameter is still not in URL
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('t=');

      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeNull();
    });

    await test.step('Switch to Offset (custom) and verify t parameter remains absent', async () => {
      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await startOffsetDropdown.click();

      // Select "Offset" option
      const offsetOption = page.getByTestId('start-offset-custom');
      await expect(offsetOption).toBeVisible();
      await offsetOption.click();

      // Verify timestamp parameter is still not in URL
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('t=');

      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeNull();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should remove timestamp parameter from URL when switching to non-timestamp offset type', async ({ page }) => {
    const topicName = `timestamp-url-removal-${Date.now()}`;
    const message = 'Test message for URL parameter removal';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await test.step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      // Wait for messages to load
      await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });

      // Open the start offset dropdown
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Timestamp" option
      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      // DateTimeInput should now be visible
      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify timestamp parameter is added to URL', async () => {
      // Wait for URL to update with timestamp parameter
      await page.waitForURL((url) => url.searchParams.has('t'), { timeout: 5000 });

      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      // Extract and verify timestamp parameter
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();
      expect(Number(urlTimestamp)).toBeGreaterThan(0);
    });

    await test.step('Switch to Beginning offset type', async () => {
      // Open the start offset dropdown again
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      // Select "Beginning" option
      const beginningOption = page.getByTestId('start-offset-beginning');
      await expect(beginningOption).toBeVisible();
      await beginningOption.click();

      // DateTimeInput should no longer be visible
      await expect(page.getByTestId('start-timestamp-input')).not.toBeVisible();
    });

    await test.step('Verify timestamp parameter is removed from URL', async () => {
      // Wait for URL to update and remove timestamp parameter
      await page.waitForURL((url) => !url.searchParams.has('t'), { timeout: 5000 });

      const currentUrl = page.url();
      expect(currentUrl).not.toContain('t=');

      // Verify timestamp parameter is not in URL
      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeNull();
    });

    await topicPage.deleteTopic(topicName);
  });
});
