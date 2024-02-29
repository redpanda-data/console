import { test, expect } from '@playwright/test';

// Basic tests to help us setup a CI pipeline
test.describe('Core', () => {
    test('has title', async ({page}) => {
        await page.goto('/');

        await expect(page).toHaveTitle(/Redpanda/);
    });

    test('has version title', async ({page}) => {
        await page.goto('/');

        await expect(page.getByTestId('versionTitle')).toBeVisible();
    });
});
