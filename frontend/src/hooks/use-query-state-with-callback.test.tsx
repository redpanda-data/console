import { describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { parseAsString } from 'nuqs';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';

import { useQueryStateWithCallback } from './use-query-state-with-callback';

rs.mock('@tanstack/react-router', () => ({ useLocation: () => ({ searchStr: '?sort=first' }) }));

describe('query state with a local callback', () => {
  test('returns URL completion to callers rather than discarding the setter promise', async () => {
    const onUpdate = rs.fn();
    const { result } = renderHook(
      () =>
        useQueryStateWithCallback(
          {
            onUpdate,
            getDefaultValue: () => 'default',
          },
          'sort',
          parseAsString.withDefault('default')
        ),
      {
        wrapper: withNuqsTestingAdapter({ searchParams: '?sort=first', hasMemory: true }),
      }
    );
    let completion: Promise<URLSearchParams> | undefined;
    act(() => {
      completion = result.current[1]('second');
    });
    expect(completion).toBeInstanceOf(Promise);
    let committed: URLSearchParams | undefined;
    await act(async () => {
      committed = await completion;
    });
    expect(committed?.get('sort')).toBe('second');
    expect(onUpdate).toHaveBeenCalledWith('second');
    expect(result.current[0]).toBe('second');
  });
  test('synchronizes computed updater values and restores the parser default on reset', async () => {
    const onUpdate = rs.fn();
    const { result } = renderHook(
      () =>
        useQueryStateWithCallback(
          {
            onUpdate,
            getDefaultValue: () => 'saved',
          },
          'sort',
          parseAsString.withDefault('default')
        ),
      {
        wrapper: withNuqsTestingAdapter({ searchParams: '?sort=first', hasMemory: true }),
      }
    );
    await act(async () => {
      await result.current[1]((previous) => `${previous}-next`);
    });
    expect(result.current[0]).toBe('first-next');
    expect(onUpdate).toHaveBeenLastCalledWith('first-next');
    let committed: URLSearchParams | undefined;
    await act(async () => {
      committed = await result.current[1](null);
    });
    expect(committed?.get('sort')).toBeNull();
    expect(result.current[0]).toBe('default');
    expect(onUpdate).toHaveBeenLastCalledWith('default');
  });

  test('propagates a failed URL commit to the caller', async () => {
    const failure = new Error('URL commit failed');
    const { result } = renderHook(
      () =>
        useQueryStateWithCallback(
          {
            onUpdate: () => undefined,
            getDefaultValue: () => 'default',
          },
          'sort',
          parseAsString.withDefault('default')
        ),
      {
        wrapper: withNuqsTestingAdapter({
          searchParams: '?sort=first',
          hasMemory: true,
          onUrlUpdate: (event) => {
            if (event.searchParams.get('sort') === 'second') {
              throw failure;
            }
          },
        }),
      }
    );
    let rejected = false;
    await act(async () => {
      try {
        await result.current[1]('second');
      } catch {
        rejected = true;
      }
    });
    expect(rejected).toBe(true);
  });
});
