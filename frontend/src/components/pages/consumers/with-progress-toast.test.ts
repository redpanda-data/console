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

import { toast } from 'components/redpanda-ui/components/toast/manager';

import { withProgressToast } from './with-progress-toast';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

const TOAST_ID = 'progress-toast';

const aToast = (type: string, title: string, rest: Record<string, unknown> = {}) =>
  expect.objectContaining({ type, title, ...rest });

describe('withProgressToast', () => {
  let add: ReturnType<typeof spyOn>;

  beforeEach(() => {
    add = spyOn(toast, 'add').mockReturnValue(TOAST_ID);
  });

  afterEach(() => {
    add.mockRestore();
  });

  test('settles the loading toast to done and returns the task result', async () => {
    const result = await withProgressToast('Applying offsets', () => Promise.resolve(42));

    expect(result).toBe(42);
    expect(add).toHaveBeenCalledWith(aToast('loading', 'Applying offsets...'));
    expect(add).toHaveBeenCalledWith(aToast('success', 'Applying offsets - done', { id: TOAST_ID }));
    expect(add).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('settles the loading toast to failed and rethrows', async () => {
    const failure = new Error('boom');

    await expect(withProgressToast('Applying offsets', () => Promise.reject(failure))).rejects.toBe(failure);

    expect(add).toHaveBeenCalledWith(aToast('error', 'Applying offsets - failed', { id: TOAST_ID }));
    expect(add).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  test('uses the custom failure message when one is given', async () => {
    await expect(
      withProgressToast(
        'Deleting offsets',
        () => Promise.reject(new Error('denied')),
        (err) => `Could not delete - ${(err as Error).message}`
      )
    ).rejects.toThrow('denied');

    expect(add).toHaveBeenCalledWith(aToast('loading', 'Deleting offsets...'));
    expect(add).toHaveBeenCalledWith(aToast('error', 'Could not delete - denied', { id: TOAST_ID }));
  });
});
