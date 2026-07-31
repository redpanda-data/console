import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePageTopOffset } from './use-page-top-offset';

const PAGE_TOP_VAR = '--console-page-top';
const PADDING_TOP = '32px';

// Mirrors the layout roots: chrome first, then the element wrapping <Outlet />. That
// wrapper is swapped out when ErrorDisplay takes over, so it can mount more than once.
const Harness = ({ erroring = false }: { erroring?: boolean }) => {
  const outletRef = usePageTopOffset();

  return (
    <div id="mainLayout">
      <div data-testid="chrome" />
      {erroring ? (
        <div data-testid="error" />
      ) : (
        <div data-testid="outlet" ref={outletRef} style={{ paddingTop: PADDING_TOP }} />
      )}
    </div>
  );
};

const readVar = (el: HTMLElement) => el.style.getPropertyValue(PAGE_TOP_VAR);

describe('usePageTopOffset', () => {
  // happy-dom does no layout, so every offsetTop is 0 — the padding is the observable part.
  it("publishes the wrapper's own top padding as part of the offset", () => {
    const { getByTestId } = render(<Harness />);

    expect(readVar(getByTestId('outlet'))).toBe(PADDING_TOP);
  });

  it('re-measures when the wrapper remounts after an error page', () => {
    const { getByTestId, rerender } = render(<Harness erroring={true} />);

    rerender(<Harness />);

    expect(readVar(getByTestId('outlet'))).toBe(PADDING_TOP);
  });

  it('clears the variable on unmount, so no stale height survives the page', () => {
    const { getByTestId, unmount } = render(<Harness />);
    const outlet = getByTestId('outlet');
    expect(readVar(outlet)).toBe(PADDING_TOP);

    unmount();

    expect(readVar(outlet)).toBe('');
  });
});
