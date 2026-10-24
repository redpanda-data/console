import { afterEach, describe, expect, type MockInstance, rs, test } from '@rstest/core';

import { retryAssertion, step } from './shared/assertions';

afterEach(() => {
  rs.useRealTimers();
});

async function expectCallsAfterAdvancing(assertion: MockInstance, milliseconds: number, calls: number) {
  await rs.advanceTimersByTimeAsync(milliseconds);
  expect(assertion).toHaveBeenCalledTimes(calls);
}

describe('e2E assertion retries', () => {
  test('preserves each retry interval and returns the successful assertion result', async () => {
    rs.useFakeTimers();
    const assertion = rs
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue('ready');
    const pending = retryAssertion(assertion, { timeout: 1000, intervals: [100, 250] });
    await expectCallsAfterAdvancing(assertion, 99, 1);
    await expectCallsAfterAdvancing(assertion, 1, 2);
    await expectCallsAfterAdvancing(assertion, 249, 2);
    await rs.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('ready');
    expect(assertion).toHaveBeenCalledTimes(3);
  });

  test('fails with the original assertion when the next retry would exceed the deadline', async () => {
    rs.useFakeTimers();
    const failure = new Error('expected 55 quotas');
    const assertion = rs.fn().mockRejectedValue(failure);
    const pending = retryAssertion(assertion, { timeout: 350, intervals: [100, 250] });
    const rejected = expect(pending).rejects.toBe(failure);
    await rs.advanceTimersByTimeAsync(350);
    await rejected;
    expect(assertion).toHaveBeenCalledTimes(3);
  });

  test('bounds an in-flight assertion by the original overall deadline', async () => {
    rs.useFakeTimers();
    const settled = rs.fn();
    const pending = retryAssertion(
      () =>
        new Promise<void>(() => {
          // Intentionally pending: verify the outer retry deadline bounds the assertion.
        }),
      { timeout: 350 }
    );
    pending.then(settled, settled);
    await rs.advanceTimersByTimeAsync(350);
    expect(settled).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow('Assertion did not pass within 350ms');
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
