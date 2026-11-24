import { afterEach, describe, expect, rs, test } from '@rstest/core';

import { retryAssertion, step } from './shared/assertions';

afterEach(() => {
  rs.useRealTimers();
});

describe('e2e assertion retries', () => {
  test('preserves each retry interval and returns the successful assertion result', async () => {
    rs.useFakeTimers();
    const start = Date.now();
    const attempts: number[] = [];
    const pending = retryAssertion(
      () => {
        attempts.push(Date.now() - start);
        expect(attempts.length).toBeGreaterThanOrEqual(3);
        return 'ready';
      },
      { timeout: 1000, intervals: [100, 250] }
    );

    await rs.advanceTimersByTimeAsync(349);
    expect(attempts).toEqual([0, 100]);
    await rs.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('ready');
    expect(attempts).toEqual([0, 100, 350]);
  });

  test('fails with the original assertion when the next retry would exceed the deadline', async () => {
    rs.useFakeTimers();
    const failure = new Error('expected 55 quotas');
    let attempts = 0;
    const pending = retryAssertion(
      () => {
        attempts += 1;
        throw failure;
      },
      { timeout: 350, intervals: [100, 250] }
    );

    const rejected = expect(pending).rejects.toBe(failure);
    await rs.advanceTimersByTimeAsync(350);
    await rejected;
    expect(attempts).toBe(3);
  });

  test('bounds an in-flight assertion by the original overall deadline', async () => {
    rs.useFakeTimers();
    const assertion = Promise.withResolvers<void>();
    const pending = retryAssertion(() => assertion.promise, { timeout: 350 });
    let settled = false;
    const result = pending.catch((error: unknown) => {
      settled = true;
      return error;
    });

    await rs.advanceTimersByTimeAsync(349);
    expect(settled).toBe(false);
    await rs.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ message: 'Assertion did not pass within 350ms' });
  });

  test('reports non-Error failures in the step message', async () => {
    await expect(step('Load topics', () => Promise.reject('connection closed'))).rejects.toMatchObject({
      message: 'Step failed: Load topics: connection closed',
      cause: 'connection closed',
    });
  });

  test('annotates a failed step without losing the cause or swallowing the error', async () => {
    const cause = new Error('native click failed');
    await expect(step('Create topic', () => Promise.reject(cause))).rejects.toMatchObject({
      message: 'Step failed: Create topic: native click failed',
      cause,
    });
  });
});
