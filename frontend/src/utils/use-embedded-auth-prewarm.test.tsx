import { act, renderHook } from '@testing-library/react';

import { useEmbeddedAuthPrewarm } from './use-embedded-auth-prewarm';

describe('useEmbeddedAuthPrewarm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('deduplicates focus and visibility bursts into a single prewarm', async () => {
    const prewarm = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useEmbeddedAuthPrewarm({
        debounceMs: 150,
        dedupeMs: 1000,
        prewarm,
      })
    );

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(prewarm).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(prewarm).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(prewarm).toHaveBeenCalledTimes(2);
  });
});
