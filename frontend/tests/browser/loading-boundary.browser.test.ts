import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '../shared/e2e';

const styles = readFileSync(new URL('../../src/components/ui/loading-boundary.css', import.meta.url), 'utf8');

type ReducedMotion = 'no-preference' | 'reduce';
type RevealAnimation = { pseudo: string | null };

async function mountRevealFixture(page: Page, reducedMotion: ReducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await page.setContent(`
      <style>${styles}</style>
      <button onclick="this.textContent = 'Clicked'">Background control</button>
      <div style="view-transition-name: editor; view-transition-class: console-content-reveal">Loading</div>
    `);
}

function captureRevealAnimations(page: Page): Promise<RevealAnimation[]> {
  return page.evaluate(async () => {
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
}

function expectEditorOnlyReveal(animations: RevealAnimation[], reducedMotion: ReducedMotion) {
  expect(animations.filter(({ pseudo }) => pseudo?.endsWith('(root)'))).toEqual([]);
  if (reducedMotion === 'reduce') {
    expect(animations).toEqual([]);
  } else {
    expect(animations.some(({ pseudo }) => pseudo?.endsWith('(editor)'))).toBe(true);
  }
}

async function clickBackgroundControl(page: Page) {
  const control = page.getByRole('button', { name: 'Background control' });
  const bounds = await control.boundingBox();
  if (!bounds) {
    throw new Error('Missing background control');
  }
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

function finishAnimations(page: Page) {
  return page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`editor reveal keeps the page interactive with ${reducedMotion}`, async ({ page }) => {
    await mountRevealFixture(page, reducedMotion);
    const animations = await captureRevealAnimations(page);
    expectEditorOnlyReveal(animations, reducedMotion);
    await clickBackgroundControl(page);
    await expect(page.getByRole('button', { name: 'Clicked' })).toBeVisible();
    await finishAnimations(page);
  });
}
