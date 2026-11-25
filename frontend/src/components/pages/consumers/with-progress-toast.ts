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

import { showToast } from 'utils/toast.utils';

/**
 * Runs `task` behind a loading toast labelled `<label>...`, which settles to `<label> - done` or, on failure,
 * to `failureMessage(err)` (default `<label> - failed`). The failure is rethrown for the caller to handle.
 */
export async function withProgressToast<T>(
  label: string,
  task: () => Promise<T>,
  failureMessage: (err: unknown) => string = () => `${label} - failed`
): Promise<T> {
  const toastId = showToast({ status: 'loading', title: `${label}...` });
  try {
    const result = await task();
    showToast({ status: 'success', title: `${label} - done`, id: toastId });
    return result;
  } catch (err) {
    showToast({ status: 'error', title: failureMessage(err), id: toastId });
    throw err;
  }
}
