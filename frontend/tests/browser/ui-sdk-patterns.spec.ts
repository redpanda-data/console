import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '../shared/e2e';

const ID_REFERENCE_SEPARATOR = /\s+/;

async function loadConsoleFixture(page: Page) {
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: resolve('.rstest/sdk-browser/static/js/ui-sdk-patterns.js') });
}

for (const pattern of ['tabs', 'checkbox', 'switch'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`console ${pattern} passes SDK APG checks in ${direction}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await loadConsoleFixture(page);
      expect(errors).toEqual([]);
      const result = await page.evaluate(([name, dir]) => window.checkConsolePattern(name, dir), [
        pattern,
        direction,
      ] as const);
      expect(result.passed).toBe(true);
    });
  }
}

test('fields connect native and custom editor descriptions in Chromium', async ({ page }) => {
  await loadConsoleFixture(page);
  await page.evaluate(() => window.mountConsoleFields());
  const descriptions = await page.getByRole('main').evaluate(
    (root, separator) =>
      [...root.querySelectorAll('[aria-describedby]')].map((control) =>
        (control.getAttribute('aria-describedby') ?? '')
          .split(separator)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
      ),
    ID_REFERENCE_SEPARATOR
  );
  expect(descriptions).toEqual(['Shown in the header. Name is required.', 'Use valid YAML. Source is required.']);
});

// Browser CI runs after the production build; use its real tokens and utility selectors.
const productionStyles = globSync('build/static/css/**/*.css')
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
if (!productionStyles) {
  throw new Error('Build the frontend before checking field styling.');
}

test('valid fields keep normal colors and opacity with false state attributes', async ({ page }) => {
  await loadConsoleFixture(page);
  await page.addStyleTag({ content: productionStyles });
  await page.evaluate(() => window.mountConsoleFields());
  const [valid, validString, invalid, disabled] = await page.getByRole('main').evaluate((root) =>
    [...root.querySelectorAll('[data-slot="field"]')].map((field) => {
      const label = field.querySelector('label');
      if (!label) {
        throw new Error('Missing field label');
      }
      const style = getComputedStyle(label);
      return {
        invalid: field.hasAttribute('data-invalid'),
        disabled: field.hasAttribute('data-disabled'),
        ariaInvalid: field.querySelector('input, [role="textbox"]')?.getAttribute('aria-invalid') === 'true',
        color: style.color,
        opacity: style.opacity,
      };
    })
  );
  expect(valid).toMatchObject({ invalid: false, disabled: false, ariaInvalid: false, opacity: '1' });
  expect(validString).toEqual(valid);
  expect(invalid).toMatchObject({ invalid: true, ariaInvalid: true });
  expect(valid?.color).not.toBe(invalid?.color);
  expect(disabled).toMatchObject({ invalid: true, disabled: true, color: invalid?.color, opacity: '0.5' });
  await page.screenshot({ path: '.rstest/ui-sdk-fields.png' });
});

test('agent menu presses await real Base UI action work', async ({ page }) => {
  await loadConsoleFixture(page);
  await page.evaluate(() => window.mountConsoleMenu());
  await page.getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete draft' })).toBeVisible();
  const result = page.evaluate(() => window.pressConsoleMenu());
  await Promise.race([
    expect(page.getByTestId('menu-action-status')).toHaveText('pending'),
    result.then((value) => {
      throw new Error(`Action finished before work: ${JSON.stringify(value)}`);
    }),
  ]);
  expect(await page.evaluate(() => window.isConsoleMenuFinished())).toBe(false);
  await page.evaluate(() => window.completeConsoleMenu());
  expect(await result).toMatchObject({ ok: true });
  await expect(page.getByTestId('menu-action-status')).toHaveText('done');
});
