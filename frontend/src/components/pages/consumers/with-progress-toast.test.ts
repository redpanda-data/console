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
import { afterEach, beforeEach, expect, test } from 'bun:test';

let priorToastIds: Set<string | number>;
const operationToasts = () => toast.getToasts().filter(({ id }) => !priorToastIds.has(id));

beforeEach(() => {
  priorToastIds = new Set(toast.getToasts().map(({ id }) => id));
});

afterEach(() => {
  for (const { id } of operationToasts()) {
    toast.dismiss(id);
  }
});

function loadingToastId(title: string) {
  const loading = operationToasts().find((entry) => 'title' in entry && entry.title === title);
  if (!loading) {
    throw new Error(`No toast with title: ${title}`);
  }
  expect(loading).toMatchObject({ type: 'loading' });
  return loading.id;
}

function expectSettledToast(id: number | string, title: string, type: 'success' | 'error') {
  expect(operationToasts()).toEqual([expect.objectContaining({ id, title, type })]);
}

test('updates a single loading notification in place and returns the operation result', async () => {
  const task = Promise.withResolvers<number>();
  const progress = withProgressToast('Applying offsets', () => task.promise);
  const id = loadingToastId('Applying offsets...');

  task.resolve(42);

  await expect(progress).resolves.toBe(42);
  expectSettledToast(id, 'Applying offsets - done', 'success');
});

test.each([
  { label: 'Resetting offsets', title: 'Resetting offsets - failed' },
  {
    label: 'Deleting offsets',
    title: 'Could not delete - denied',
    message: (failure: unknown) => `Could not delete - ${failure instanceof Error ? failure.message : String(failure)}`,
  },
])('settles the $label notification in place and preserves the rejection', async ({ label, title, message }) => {
  const failure = new Error('denied');
  const task = Promise.withResolvers<never>();
  const progress = withProgressToast(label, () => task.promise, message);
  const id = loadingToastId(`${label}...`);

  task.reject(failure);

  await expect(progress).rejects.toBe(failure);
  expectSettledToast(id, title, 'error');
});
