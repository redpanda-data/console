import { expect, test } from '../../shared/e2e';

test.describe('transforms setup', () => {
  test('renders the getting-started content', async ({ page }) => {
    await page.goto('/transforms-setup');

    await expect(page.getByRole('heading', { name: 'Data transforms' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Learn more' })).toBeVisible();

    await expect(page.getByText('Create and initialize a data transforms project')).toBeVisible();
    await expect(page.getByText('rpk transform init --language=tinygo')).toBeVisible();
    await expect(page.getByText('transform.yaml').first()).toBeVisible();

    await expect(page.getByRole('alert').filter({ hasText: 'Hint' })).toBeVisible();
  });

  test('offers Go and a disabled Rust tab', async ({ page }) => {
    await page.goto('/transforms-setup');

    const goTab = page.getByRole('tab', { name: 'Go' });
    const rustTab = page.getByRole('tab', { name: 'Rust' });

    await expect(goTab).toBeVisible();
    await expect(rustTab).toBeDisabled();

    await expect(page.getByText('Create and initialize a data transforms project')).toBeVisible();
  });
});
