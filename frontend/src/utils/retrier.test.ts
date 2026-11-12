import { retrier } from './utils';
import { describe, expect, mock, test } from 'bun:test';

describe('retrier', () => {
  test('resolves after a rejected attempt and stops once successful', async () => {
    const operation = mock<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce('ready');
    await expect(retrier(operation, { attempts: 2, delayTime: 0 })).resolves.toBe('ready');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('rejects with the final error once its retry budget is exhausted', async () => {
    const failure = new Error('still unavailable');
    const operation = mock(() => Promise.reject(failure));
    await expect(retrier(operation, { attempts: 2, delayTime: 0 })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test.each([0, -1, Number.NaN])('does not retry an exhausted or invalid budget: %s', async (attempts) => {
    const failure = new Error('unavailable');
    const operation = mock(() => Promise.reject(failure));
    await expect(retrier(operation, { attempts, delayTime: 0 })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('does not retry synchronous throws or throw synchronously to its caller', async () => {
    const failure = new TypeError('invalid call');
    const operation = mock((): Promise<never> => {
      throw failure;
    });
    await expect(retrier(operation, { attempts: 3, delayTime: 0 })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
