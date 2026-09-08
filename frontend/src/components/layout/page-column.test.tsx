import { describe, expect, it } from '@rstest/core';
import { render } from '@testing-library/react';

import { PageColumn } from './page-column';

const PAGE_TOP_VAR = '--console-page-top';

// Tailwind isn't loaded here, so stand in for the column's `pt-8`.
const PADDING_TOP = 32;
const styleEl = document.createElement('style');
styleEl.textContent = `.pt-8 { padding-top: ${PADDING_TOP}px; }`;
document.head.appendChild(styleEl);

// Mirrors the layout roots: chrome, then the page column. ErrorDisplay swaps the column
// out while the API is erroring, so it can mount more than once.
const Harness = ({ erroring = false }: { erroring?: boolean }) => (
  <div id="mainLayout">
    <div data-testid="chrome" />
    {erroring ? (
      <div data-testid="error" />
    ) : (
      <PageColumn>
        <div data-testid="page" />
      </PageColumn>
    )}
  </div>
);

const column = (container: HTMLElement) => container.querySelector('.pt-8') as HTMLElement;
const readVar = (el: HTMLElement) => el.style.getPropertyValue(PAGE_TOP_VAR);

describe('PageColumn', () => {
  // happy-dom does no layout, so every offsetTop is 0 — the padding is the observable part.
  it("publishes an offset including the column's own top padding", () => {
    const { container } = render(<Harness />);

    expect(readVar(column(container))).toBe(`${PADDING_TOP}px`);
  });

  it('re-measures when the column remounts after an error page', () => {
    const { container, rerender } = render(<Harness erroring={true} />);

    rerender(<Harness />);

    expect(readVar(column(container))).toBe(`${PADDING_TOP}px`);
  });

  it('clears the variable on unmount, so no stale height survives the page', () => {
    const { container, unmount } = render(<Harness />);
    const el = column(container);
    expect(readVar(el)).toBe(`${PADDING_TOP}px`);

    unmount();

    expect(readVar(el)).toBe('');
  });
});
