import { expect, test } from '@playwright/test';

import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../../src/components/ui/loading-boundary.css', import.meta.url), 'utf8');

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`editor reveal keeps the page interactive with ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setContent(`
      <style>${styles}</style>
      <button onclick="this.textContent = 'Clicked'">Background control</button>
      <div style="view-transition-name: editor; view-transition-class: console-content-reveal">Loading</div>
    `);
    const animations = await page.evaluate(async () => {
      const editor = document.querySelector('div');
      if (!editor) {
        throw new Error('Missing editor fixture');
      }
      const transition = document.startViewTransition(() => {
        editor.textContent = 'Ready';
      });
      await transition.ready;
      const activeAnimations = document.getAnimations();
      // Hold the active snapshots to exercise hit testing during, not after, the reveal.
      for (const animation of activeAnimations) {
        animation.pause();
      }
      return activeAnimations.map((animation) => ({
        pseudo: animation.effect instanceof KeyframeEffect ? animation.effect.pseudoElement : null,
      }));
    });
    expect(animations.filter(({ pseudo }) => pseudo?.endsWith('(root)'))).toEqual([]);
    if (reducedMotion === 'reduce') {
      expect(animations).toEqual([]);
    } else {
      expect(animations.some(({ pseudo }) => pseudo?.endsWith('(editor)'))).toBe(true);
    }
    const control = page.getByRole('button', { name: 'Background control' });
    const bounds = await control.boundingBox();
    if (!bounds) {
      throw new Error('Missing background control');
    }
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.getByRole('button', { name: 'Clicked' })).toBeVisible();
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.finish();
      }
    });
  });
}
