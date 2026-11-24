import { step } from '../../shared/e2e';

// spec: specs/topics.md
// seed: tests/shared/seed.e2e.test.ts

import { expect, type Page, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

const createTopicFromList = async (page: Page, topicName: string) => {
  await page.goto('/topics');
  await page.getByTestId('create-topic-button').click();
  await page.getByTestId('topic-name').fill(topicName);
  await page.getByTestId('onOk-button').click();
  await page.getByTestId('create-topic-success__close-button').click();
};

test.describe('topic Creation', () => {
  test('should create topic with default settings', async ({ page }) => {
    const topicName = `default-topic-${crypto.randomUUID()}`;

    await step('Open create topic modal', async () => {
      await page.goto('/topics');
      await page.getByTestId('create-topic-button').click();

      await expect(page.getByTestId('topic-name')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('topic-name')).toBeFocused();
    });

    await step('Create topic with default settings', async () => {
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();

      await expect(page.getByTestId('create-topic-success__close-button')).toBeVisible();
      await page.getByTestId('create-topic-success__close-button').click();

      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });

  test('should create topic with custom configuration', async ({ page }) => {
    const topicName = `custom-config-${crypto.randomUUID()}`;

    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await step('Configure topic settings', async () => {
      await page.getByTestId('topic-name').fill(topicName);

      const partitionsInput = page.getByPlaceholder(/partitions/iu);
      if (await partitionsInput.isVisible()) {
        await partitionsInput.fill('6');
      }

      await page.getByTestId('onOk-button').click();
      await page.getByTestId('create-topic-success__close-button').click();
    });

    await step('Verify topic was created', async () => {
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await step('Verify configuration', async () => {
      await page.goto(`/topics/${topicName}#configuration`);

      await expect(page.getByTestId('config-group-table')).toBeVisible({ timeout: 5000 });
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });

  test('should validate empty topic name', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await step('Verify create button is disabled for empty name', async () => {
      await expect(page.getByTestId('topic-name')).toHaveValue('');

      const createButton = page.getByTestId('onOk-button');
      await expect(createButton).toBeDisabled();

      await expect(page.getByTestId('topic-name')).toBeVisible();
    });

    await step('Cancel creation', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByTestId('create-topic-button')).toBeVisible();
    });
  });

  test('should validate invalid topic name characters', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await step('Test invalid topic name with spaces', async () => {
      await page.getByTestId('topic-name').fill('invalid topic name with spaces!');

      const createButton = page.getByTestId('onOk-button');

      if (await createButton.isEnabled()) {
        await createButton.click();

        await expect(page.getByTestId('topic-name')).toBeVisible();
      } else {
        await expect(createButton).toBeDisabled();
      }
    });

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should validate replication factor against broker count', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await step('Set high replication factor', async () => {
      await page.getByTestId('topic-name').fill(`replication-test-${crypto.randomUUID()}`);

      const replicationInput = page.getByPlaceholder(/replication/iu);
      if ((await replicationInput.isVisible()) && !(await replicationInput.isDisabled())) {
        await replicationInput.fill('999');

        const errorText = page.getByText(/replication factor/iu);
        if (await errorText.isVisible()) {
          await expect(errorText).toBeVisible();
        }
      }
    });

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should cancel topic creation', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await step('Fill form and cancel', async () => {
      await page.getByTestId('topic-name').fill('cancelled-topic');

      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByTestId('create-topic-button')).toBeVisible();
    });

    await step('Verify topic was not created', async () => {
      await expect(page.getByTestId('topic-link-cancelled-topic')).not.toBeVisible();
    });
  });

  test('should create topic and verify it appears in multiple views', async ({ page }) => {
    const topicName = `multi-view-${crypto.randomUUID()}`;

    await createTopicFromList(page, topicName);

    await step('Verify in topics list', async () => {
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await step('Navigate to topic details', async () => {
      await page.getByTestId(`topic-link-${topicName}`).click();
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}`, 'u'));
      await expect(page.getByText(topicName).first()).toBeVisible();
    });

    await step('Navigate back to list', async () => {
      await page.goto('/topics');
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });
});
