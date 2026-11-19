import { expect, test } from '../../shared/e2e';

const RP_CONNECT_TAB = /Redpanda Connect/u;
const HINT_TEXT = /show the full menu of components available/u;

test.describe('redpanda Connect intro', () => {
  test('renders the install steps, the walkthrough and the hint', async ({ page }) => {
    await page.goto('/connect-clusters');
    await page.getByRole('tab', { name: RP_CONNECT_TAB }).click();

    await expect(page.getByRole('heading', { name: 'Using Redpanda Connect' })).toBeVisible();

    await expect(page.getByText('Install Redpanda Connect')).toBeVisible();
    await expect(page.getByText('Choose your install method')).toBeVisible();
    await expect(page.getByText('Make sure that your output topic and logs topic both exist.')).toBeVisible();

    await expect(page.getByText('Hint', { exact: true })).toBeVisible();
    await expect(page.getByText(HINT_TEXT)).toBeVisible();
  });

  test('swaps the install snippet when the method changes', async ({ page }) => {
    await page.goto('/connect-clusters');
    await page.getByRole('tab', { name: RP_CONNECT_TAB }).click();

    const installPicker = page.getByRole('combobox').first();
    await expect(installPicker).toBeVisible();

    const installSnippet = page.locator('pre').first();
    await expect(installSnippet).toContainText('brew install');

    await installPicker.click();
    await page.getByRole('option', { name: 'Linux' }).click();

    await expect(installSnippet).toContainText('rpk-linux-amd64.zip');
    await expect(installSnippet).not.toContainText('brew install');
  });
});
