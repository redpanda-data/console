import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the transforms setup page.
 *
 * `transforms.spec.ts` is commented out because it needs transforms seeded through the
 * backend API, which the UI cannot do yet. This page has no such dependency: it renders
 * static getting-started content, so it is reachable in every variant and guards the
 * pieces a re-skin can break — the tab strip, the code blocks, and the hint callout.
 */
test.describe('Transforms setup', () => {
  test('renders the getting-started content', async ({ page }) => {
    await page.goto('/transforms-setup');

    await expect(page.getByRole('heading', { name: 'Data transforms' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Learn more' })).toBeVisible();

    await expect(page.getByText('Create and initialize a data transforms project')).toBeVisible();
    await expect(page.getByText('rpk transform init --language=tinygo')).toBeVisible();
    await expect(page.getByText('transform.yaml').first()).toBeVisible();

    // The hint is a registry Alert, which paints its own icon.
    await expect(page.getByRole('alert').filter({ hasText: 'Hint' })).toBeVisible();
  });

  test('offers Go and a disabled Rust tab', async ({ page }) => {
    await page.goto('/transforms-setup');

    const goTab = page.getByRole('tab', { name: 'Go' });
    const rustTab = page.getByRole('tab', { name: 'Rust' });

    await expect(goTab).toBeVisible();
    await expect(rustTab).toBeDisabled();

    // Go is the default tab, so its panel is the one on screen.
    await expect(page.getByText('Create and initialize a data transforms project')).toBeVisible();
  });
});
