import { afterAll, beforeAll } from '@rstest/core';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { readFileSync } from 'node:fs';
import { InvalidConfigNotice } from '../../src/components/pages/rp-connect/pipeline/invalid-config-notice';
import { expect, type Page, test } from '../shared/e2e';

// This node-side browser fixture uses the runner's classic JSX transform for imported components.
const previousReact: unknown = Reflect.get(globalThis, 'React');
beforeAll(() => {
  Reflect.set(globalThis, 'React', React);
});
afterAll(() => {
  if (previousReact === undefined) {
    Reflect.deleteProperty(globalThis, 'React');
  } else {
    Reflect.set(globalThis, 'React', previousReact);
  }
});

const styles = readFileSync(
  new URL('../../src/components/pages/rp-connect/pipeline/pipeline-editor.css', import.meta.url),
  'utf8'
);

async function expectNoticeGeometry(page: Page) {
  const bounds = await page.getByRole('alert').boundingBox();
  if (!bounds) {
    throw new Error('Missing warning bounds');
  }
  expect(bounds.width).toBeLessThan(400);
  expect(bounds.x).toBe(12);
  expect(bounds.y).toBe(12);
}

for (const variant of ['floating', 'compact'] as const) {
  test(`pipeline ${variant} warning retains content width and variant padding`, async ({ page }) => {
    const notice = renderToStaticMarkup(
      // biome-ignore lint/correctness/noChildrenProp: React.createElement's checked props require this component's children; this is not JSX.
      createElement(InvalidConfigNotice, { className: 'notice-position', variant, children: 'Invalid pipeline YAML' })
    );
    await page.setContent(
      `<style>:root { --spacing: 4px; } .notice-position { position: absolute; inset-block-start: 12px; inset-inline-start: 12px; }</style><style>${styles}</style>${notice}<button style="position:absolute;inset-block-start:12px;inset-inline-end:12px" onclick="this.textContent='Clicked'">Canvas controls</button>`
    );
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expectNoticeGeometry(page);
    await expect(alert).toHaveCSS('padding-inline-start', variant === 'floating' ? '12px' : '10px');
    await expect(alert).toHaveCSS('padding-block-start', variant === 'floating' ? '6px' : '8px');
    await page.getByRole('button', { name: 'Canvas controls' }).click();
    await expect(page.getByRole('button', { name: 'Clicked' })).toBeVisible();
  });
}
