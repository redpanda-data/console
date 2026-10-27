/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { toast } from 'sonner';

import { withProgressToast } from './with-progress-toast';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

const TOAST_ID = 'progress-toast';

describe('withProgressToast', () => {
  let loading: ReturnType<typeof spyOn>;
  let success: ReturnType<typeof spyOn>;
  let error: ReturnType<typeof spyOn>;

  beforeEach(() => {
    loading = spyOn(toast, 'loading').mockReturnValue(TOAST_ID);
    success = spyOn(toast, 'success').mockReturnValue(TOAST_ID);
    error = spyOn(toast, 'error').mockReturnValue(TOAST_ID);
  });

  afterEach(() => {
    loading.mockRestore();
    success.mockRestore();
    error.mockRestore();
  });

  test('settles the loading toast to done and returns the task result', async () => {
    const result = await withProgressToast('Applying offsets', () => Promise.resolve(42));

    expect(result).toBe(42);
    expect(loading).toHaveBeenCalledWith('Applying offsets...');
    expect(success).toHaveBeenCalledWith('Applying offsets - done', { id: TOAST_ID });
    expect(error).not.toHaveBeenCalled();
  });

  test('settles the loading toast to failed and rethrows', async () => {
    const failure = new Error('boom');

    await expect(withProgressToast('Applying offsets', () => Promise.reject(failure))).rejects.toBe(failure);

    expect(error).toHaveBeenCalledWith('Applying offsets - failed', { id: TOAST_ID });
    expect(success).not.toHaveBeenCalled();
  });

  test('uses the custom failure message when one is given', async () => {
    await expect(
      withProgressToast(
        'Deleting offsets',
        () => Promise.reject(new Error('denied')),
        (err) => `Could not delete - ${(err as Error).message}`
      )
    ).rejects.toThrow('denied');

    expect(loading).toHaveBeenCalledWith('Deleting offsets...');
    expect(error).toHaveBeenCalledWith('Could not delete - denied', { id: TOAST_ID });
  });
});
