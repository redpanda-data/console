import { resolve } from 'node:path';
import { expect, test } from '../shared/e2e';

for (const pattern of ['tabs', 'checkbox', 'switch'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`console ${pattern} passes SDK APG checks in ${direction}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setContent('<html><body></body></html>');
      await page.addScriptTag({ path: resolve('.rstest/sdk-browser/static/js/ui-sdk-patterns.js') });
      expect(errors).toEqual([]);
      const result = await page.evaluate(([name, dir]) => window.checkConsolePattern(name, dir), [
        pattern,
        direction,
      ] as const);
      expect(result.passed).toBe(true);
    });
  }
}
