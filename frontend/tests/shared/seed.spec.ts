import { expect, test } from '@playwright/test';

const REDPANDA_TITLE_REGEX = /Redpanda/;

test.describe('Seed Test for Redpanda Console', () => {
  test('seed - application setup and basic navigation', async ({ page }) => {
    // Navigate to Redpanda Console homepage
    await page.goto('/');

    // Verify application loaded successfully
    await expect(page).toHaveTitle(REDPANDA_TITLE_REGEX);

    // Verify version title is visible (basic component check)
    await expect(page.getByTestId('versionTitle')).toBeVisible();

    // This seed test establishes:
    // - Base URL navigation works
    // - Application renders correctly
    // - Basic UI elements are visible
    // - Test environment is properly configured
    //
    // The planner agent will use this context to understand
    // your application structure and create test scenarios.
  });
});
