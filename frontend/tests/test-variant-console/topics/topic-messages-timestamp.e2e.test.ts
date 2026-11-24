import { expect, type Request, step, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

const isTimestampListMessagesRequest = (request: Request, timestampInMilliseconds: number) => {
  if (!request.url().includes('ConsoleService/ListMessages') || request.method() !== 'POST') {
    return false;
  }

  try {
    const postData = request.postData();
    if (!postData) {
      return false;
    }

    return (
      postData.includes('"startOffset":"-4"') && postData.includes(`"startTimestamp":"${timestampInMilliseconds}"`)
    );
  } catch {
    return false;
  }
};

const expectTimestampListMessagesRequest = (apiRequest: Request, timestampInMilliseconds: number) => {
  expect(apiRequest).toBeTruthy();

  const postData = apiRequest.postData();
  expect(postData).toBeTruthy();
  expect(postData).toContain('"startOffset":"-4"');
  expect(postData).toContain(`"startTimestamp":"${timestampInMilliseconds}"`);
};

const expectUrlTimestamp = (currentUrl: string, timestampInMilliseconds: number) => {
  expect(currentUrl).toContain('t=');

  const urlTimestamp = new URL(currentUrl).searchParams.get('t');
  expect(urlTimestamp).toBeTruthy();

  expect(Number(urlTimestamp)).toBe(timestampInMilliseconds);
};

test.describe('filter Messages by Timestamp', () => {
  test('should set timestamp and verify API request with correct parameters', async ({ page }) => {
    const topicName = `timestamp-filter-${crypto.randomUUID()}`;
    const message = 'Test message for timestamp filter';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.clock.setFixedTime(new Date('2026-01-15T12:00:00'));
      await page.goto(`/topics/${topicName}`);

      await page.waitForRequest((request) => request.url().includes('ConsoleService/ListMessages'));

      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await step('Set timestamp and verify URL update and API request', async () => {
      const timeValue = '11:00';

      await step('Open date/time picker', async () => {
        const calendarTrigger = page.getByTestId('start-timestamp-input').getByLabel('Open calendar');
        await expect(calendarTrigger).toBeVisible();
        await calendarTrigger.click();

        await expect(page.locator('input[type="time"]')).toBeVisible();
      });

      await step('Fill time input and wait for API request', async () => {
        const timeInput = page.locator('input[type="time"]');
        await expect(timeInput).toBeVisible();

        const apiRequestPromise = page.waitForRequest((request) => {
          if (!request.url().includes('ConsoleService/ListMessages') || request.method() !== 'POST') {
            return false;
          }

          try {
            const postData = request.postData();
            if (!postData) {
              return false;
            }

            return postData.includes('"startOffset":"-4"') && postData.includes('"startTimestamp"');
          } catch {
            return false;
          }
        });

        await timeInput.fill(timeValue);

        const apiRequest = await apiRequestPromise;
        expect(apiRequest).toBeTruthy();
        expect(apiRequest.url()).toContain('ListMessages');
      });
    });

    await step('Verify URL contains timestamp parameter', () => {
      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();
      expect(Number(urlTimestamp)).toBeGreaterThan(0);
    });

    await step('Verify date input displays a value', async () => {
      await page.keyboard.press('Escape');
      await expect(page.locator('input[type="time"]')).not.toBeVisible({ timeout: 3000 });

      const dateTimeInput = page.getByTestId('start-timestamp-input').locator('input[type="number"]');
      await expect(dateTimeInput).toBeVisible();
      const displayValue = await dateTimeInput.inputValue();

      expect(displayValue).toBeTruthy();
      expect(Number(displayValue)).toBeGreaterThan(0);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should accept unix timestamp in seconds and convert to milliseconds in URL', async ({ page }) => {
    const topicName = `timestamp-unix-${crypto.randomUUID()}`;
    const message = 'Test message for unix timestamp input';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      await page.waitForRequest((request) => request.url().includes('ConsoleService/ListMessages'));

      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await step('Input unix timestamp in seconds format', async () => {
      const timestampInSeconds = 1_704_067_200;
      const timestampInMilliseconds = timestampInSeconds * 1000;

      const numberInput = page.getByTestId('start-timestamp-input').locator('input[type="number"]');
      await expect(numberInput).toBeVisible();

      const apiRequestPromise = page.waitForRequest((request) =>
        isTimestampListMessagesRequest(request, timestampInMilliseconds)
      );

      await numberInput.fill(String(timestampInSeconds));
      await numberInput.press('Enter');

      const apiRequest = await apiRequestPromise;

      expectTimestampListMessagesRequest(apiRequest, timestampInMilliseconds);
      expectUrlTimestamp(page.url(), timestampInMilliseconds);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should remove timestamp parameter from URL when switching to non-timestamp offset type', async ({ page }) => {
    const topicName = `timestamp-url-removal-${crypto.randomUUID()}`;
    const message = 'Test message for URL parameter removal';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message);

    await step('Navigate to topic and select Timestamp offset origin', async () => {
      await page.goto(`/topics/${topicName}`);

      await page.waitForRequest((request) => request.url().includes('ConsoleService/ListMessages'));

      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      const timestampOption = page.getByTestId('start-offset-timestamp');
      await expect(timestampOption).toBeVisible();
      await timestampOption.click();

      await expect(page.getByTestId('start-timestamp-input')).toBeVisible({ timeout: 5000 });
    });

    await step('Verify timestamp parameter is added to URL', async () => {
      await page.waitForURL((url) => url.searchParams.has('t'), { timeout: 5000 });

      const currentUrl = page.url();
      expect(currentUrl).toContain('t=');

      const urlParams = new URL(currentUrl).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeTruthy();
      expect(Number(urlTimestamp)).toBeGreaterThan(0);
    });

    await step('Switch to Beginning offset type', async () => {
      const startOffsetDropdown = page.getByTestId('start-offset-dropdown');
      await expect(startOffsetDropdown).toBeVisible();
      await startOffsetDropdown.click();

      const beginningOption = page.getByTestId('start-offset-beginning');
      await expect(beginningOption).toBeVisible();
      await beginningOption.click();

      await expect(page.getByTestId('start-timestamp-input')).not.toBeVisible();
    });

    await step('Verify timestamp parameter is removed from URL', async () => {
      await page.waitForURL((url) => !url.searchParams.has('t'), { timeout: 5000 });

      const urlParams = new URL(page.url()).searchParams;
      const urlTimestamp = urlParams.get('t');
      expect(urlTimestamp).toBeNull();
    });

    await topicPage.deleteTopic(topicName);
  });
});
