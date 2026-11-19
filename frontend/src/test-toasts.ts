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

import { expect, rs } from '@rstest/core';
import { toast } from 'components/redpanda-ui/components/toast/manager';
import type { ToastStatus } from 'utils/toast.utils';

/** Spies on the registry toast manager every `showToast` goes through; the toasts still queue as normal. */
export const spyOnToasts = () => rs.spyOn(toast, 'add');

/** Matches a `toast.add` call by status and title, plus any other fields given (e.g. `description`). */
export const aToast = (status: ToastStatus | undefined, title: unknown, rest: Record<string, unknown> = {}) =>
  expect.objectContaining({ type: status, title, ...rest });

/** Matches any `toast.add` call with this status. */
export const anyToast = (status: ToastStatus) => expect.objectContaining({ type: status });
