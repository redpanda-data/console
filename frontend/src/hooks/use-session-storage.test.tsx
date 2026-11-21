import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { z } from 'zod';

import { useSessionStorage } from './use-session-storage';

const decode = (value: unknown) => z.object({ count: z.number() }).parse(value);
afterEach(() => rs.restoreAllMocks());

describe('useSessionStorage decoding', () => {
  test('reads valid state and persists functional updates', () => {
    sessionStorage.setItem('session-contract', '{"count":0}');
    const { result } = renderHook(() => useSessionStorage('session-contract', { count: 1 }, decode));
    expect(result.current[0]).toEqual({ count: 0 });
    act(() => result.current[1]((previous) => ({ count: previous.count + 2 })));
    expect(result.current[0]).toEqual({ count: 2 });
    expect(sessionStorage.getItem('session-contract')).toBe('{"count":2}');
  });

  test('reports invalid storage and falls back to the real initial value', () => {
    const warning = rs.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessionStorage.setItem('session-contract', '{"count":"invalid"}');
    const { result } = renderHook(() => useSessionStorage('session-contract', { count: 3 }, decode));
    expect(result.current[0]).toEqual({ count: 3 });
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
