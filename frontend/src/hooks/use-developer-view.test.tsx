import { describe, expect, it } from '@rstest/core';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import useDeveloperView from './use-developer-view';

async function enableDeveloperView(user: ReturnType<typeof userEvent.setup>) {
  const { result, unmount } = renderHook(() => useDeveloperView());
  expect(result.current).toBe(false);
  await user.keyboard('?');
  expect(result.current).toBe(true);
  unmount();
}

describe('useDeveloperView', () => {
  it('defaults off, toggles on ?, and restores the stored choice after remount', async () => {
    const user = userEvent.setup();
    await enableDeveloperView(user);

    const second = renderHook(() => useDeveloperView());
    expect(second.result.current).toBe(true);
    await user.keyboard('?');
    expect(second.result.current).toBe(false);
    expect(window.localStorage.getItem('dv')).toBe('false');
  });

  it('returns false when localStorage contains invalid JSON', () => {
    window.localStorage.setItem('dv', 'not-json');
    const { result } = renderHook(() => useDeveloperView());
    expect(result.current).toBe(false);
  });
});
