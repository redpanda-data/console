import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the Redpanda Connect intro page — 15 distinct Chakra symbols (Grid, Stack,
 * OrderedList, CodeBlock, Alert…) and no Playwright spec until now.
 *
 * This is the only rp-connect surface reachable in a test variant: the OSS Console config declares
 * no pipelines API and no `SecretService`, so `Features.pipelinesApi` is false and
 * `pages/connect/overview.tsx` renders `RedpandaConnectIntro` instead of the pipelines list. The
 * pipeline and secret pages need a dataplane, which no variant provides — their coverage is the
 * integration test beside `secrets-create.tsx`.
 *
 * What a re-skin breaks invisibly here is structure rather than data: the ordered walkthrough, the
 * install-method select driving the code block, and the hint alert. Code assertions go through
 * `toContainText` on the `<pre>`, because the block is syntax-highlighted asynchronously and the
 * text arrives split across spans.
 */
const RP_CONNECT_TAB = /Redpanda Connect/;
const HINT_TEXT = /show the full menu of components available/;

test.describe('Redpanda Connect intro', () => {
  test('renders the install steps, the walkthrough and the hint', async ({ page }) => {
    await page.goto('/connect-clusters');
    await page.getByRole('tab', { name: RP_CONNECT_TAB }).click();

    await expect(page.getByRole('heading', { name: 'Using Redpanda Connect' })).toBeVisible();

    // The numbered walkthrough; its first step owns the install picker.
    await expect(page.getByText('Install Redpanda Connect')).toBeVisible();
    await expect(page.getByText('Choose your install method')).toBeVisible();
    await expect(page.getByText('Make sure that your output topic and logs topic both exist.')).toBeVisible();

    // The hint sits in an Alert, whose description is a grid of block children.
    await expect(page.getByText('Hint', { exact: true })).toBeVisible();
    await expect(page.getByText(HINT_TEXT)).toBeVisible();
  });

  test('swaps the install snippet when the method changes', async ({ page }) => {
    await page.goto('/connect-clusters');
    await page.getByRole('tab', { name: RP_CONNECT_TAB }).click();

    const installPicker = page.getByRole('combobox').first();
    await expect(installPicker).toBeVisible();

    // Homebrew is the default selection, and the first code block shows its snippet.
    const installSnippet = page.locator('pre').first();
    await expect(installSnippet).toContainText('brew install');

    await installPicker.click();
    await page.getByRole('option', { name: 'Linux' }).click();

    await expect(installSnippet).toContainText('rpk-linux-amd64.zip');
    await expect(installSnippet).not.toContainText('brew install');
  });
});
