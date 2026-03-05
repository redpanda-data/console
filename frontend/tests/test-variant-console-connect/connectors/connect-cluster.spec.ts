import { expect, test } from '@playwright/test';

test.describe('Kafka Connect Cluster', () => {
  test('should show Kafka Connect tab on connect page', async ({ page }) => {
    await page.goto('/connect-clusters?defaultTab=kafka-connect');
    await expect(page.getByRole('tab', { name: 'Kafka Connect' })).toBeVisible();
  });

  test('should navigate into cluster and show connectors page', async ({ page }) => {
    await page.goto('/connect-clusters/local-connect-cluster');
    await expect(page.getByRole('button', { name: /create connector/i })).toBeVisible();
  });
});
