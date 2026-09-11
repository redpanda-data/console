import { afterEach, describe, expect, it } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';

import { useExpandedPageMode } from './use-expanded-page-mode';

const STORAGE_KEY = 'rp-test-page-mode';
const PAGE_EXPANDED_ATTR = 'data-page-expanded';

const isExpanded = () => document.documentElement.hasAttribute(PAGE_EXPANDED_ATTR);

// The hook reads `getClientRects()` for its on-screen check; happy-dom does no layout.
const createPageRoot = ({ onScreen }: { onScreen: boolean }) => {
  const el = document.createElement('div');
  el.getClientRects = () => (onScreen ? [new DOMRect(0, 0, 800, 600)] : []) as unknown as DOMRectList;
  document.body.appendChild(el);
  return el;
};

const renderExpandedPage = ({ onScreen = true }: { onScreen?: boolean } = {}) => {
  const pageRoot = createPageRoot({ onScreen });
  const view = renderHook(() => useExpandedPageMode({ storageKey: STORAGE_KEY }));
  act(() => {
    view.result.current.ref(pageRoot);
  });
  return { ...view, pageRoot };
};

describe('useExpandedPageMode', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(PAGE_EXPANDED_ATTR);
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('starts collapsed and sets no attribute when nothing is stored', () => {
    const { result } = renderExpandedPage();

    expect(result.current.expanded).toBe(false);
    expect(isExpanded()).toBe(false);
  });

  it('restores the stored expanded preference and marks the document', () => {
    localStorage.setItem(STORAGE_KEY, 'full');

    const { result } = renderExpandedPage();

    expect(result.current.expanded).toBe(true);
    expect(isExpanded()).toBe(true);
  });

  it('persists both directions of the toggle', () => {
    const { result } = renderExpandedPage();

    act(() => {
      result.current.toggleExpanded();
    });
    expect(isExpanded()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('full');

    act(() => {
      result.current.toggleExpanded();
    });
    expect(isExpanded()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('boxed');
  });

  it('clears the attribute when the page unmounts, so it cannot bleed onto the next page', () => {
    localStorage.setItem(STORAGE_KEY, 'full');
    const { unmount } = renderExpandedPage();
    expect(isExpanded()).toBe(true);

    unmount();

    expect(isExpanded()).toBe(false);
  });

  it('holds the preference but not the attribute while the page root is off screen', () => {
    localStorage.setItem(STORAGE_KEY, 'full');

    // Embedded Cloud UI keeps Console mounted and hidden on host routes.
    const { result } = renderExpandedPage({ onScreen: false });

    expect(result.current.expanded).toBe(true);
    expect(isExpanded()).toBe(false);
  });
});
