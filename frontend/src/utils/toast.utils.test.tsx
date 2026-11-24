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

import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Toaster } from 'components/redpanda-ui/components/toast';

import { closeToast, type ShowToastOptions, showToast, updateToast } from './toast.utils';

beforeEach(() => {
  rs.useFakeTimers();
});

afterEach(() => {
  cleanup();
  rs.useRealTimers();
});

function mountToaster() {
  render(<Toaster limit={4} timeout={9000} />);
  const closed: string[] = [];
  const notify = ({ title, ...options }: ShowToastOptions & { title: string }) => {
    let id = '';
    act(() => {
      id = showToast({ ...options, title, onClose: () => closed.push(title) });
    });
    return id;
  };
  const expectClosedAfter = async (ms: number, expected: string[]) => {
    await act(() => rs.advanceTimersByTimeAsync(ms));
    expect(closed).toEqual(expected);
  };
  return { closed, expectClosedAfter, notify };
}

function expectVisibleNotifications(...titles: string[]) {
  for (const title of titles) {
    expect(screen.getByText(title)).toBeVisible();
  }
}

function expectNotificationDescription(title: string, description: string) {
  const region = screen.getByText(title).closest<HTMLElement>('[data-slot="toast"]');
  if (!region) {
    throw new Error(`Notification not found: ${title}`);
  }
  expect(within(region).getByText(description)).toBeVisible();
}

test('dismisses a success after five seconds but keeps errors and sticky notifications', async () => {
  const { expectClosedAfter, notify } = mountToaster();
  notify({ status: 'success', title: 'Saved' });
  notify({ status: 'error', title: 'Save failed' });
  notify({ status: 'info', title: 'Needs attention', duration: null });

  await expectClosedAfter(4999, []);
  await expectClosedAfter(1, ['Saved']);
  await expectClosedAfter(9000, ['Saved']);
  expectVisibleNotifications('Save failed', 'Needs attention');
});

test('updates or closes only the notification for the specified resource', () => {
  const { closed, notify } = mountToaster();
  const alpha = notify({ id: 'throttle', resourceName: 'alpha', title: 'Resize alpha', status: 'loading' });
  const beta = notify({ id: 'throttle', resourceName: 'beta', title: 'Resize beta', status: 'loading' });
  const scopeOnly = notify({ resourceName: 'cluster', title: 'Cluster update', status: 'info' });

  act(() => {
    updateToast(alpha, { description: 'Applying the new limit' });
    closeToast('');
  });

  expect([alpha, beta, scopeOnly]).toEqual(['throttle_alpha', 'throttle_beta', 'cluster']);
  expectNotificationDescription('Resize alpha', 'Applying the new limit');

  act(() => closeToast(alpha));
  expect(closed).toEqual(['Resize alpha']);
  expectVisibleNotifications('Resize beta', 'Cluster update');
});

test('changes dismissal timing when status or an explicit duration changes', async () => {
  const { expectClosedAfter, notify } = mountToaster();
  const recovered = notify({ status: 'error', title: 'Recovered' });
  const brief = notify({ status: 'info', title: 'Brief warning' });
  const sticky = notify({ status: 'info', title: 'Keep this', duration: 1000 });
  const failed = notify({ status: 'info', title: 'Still failing' });

  act(() => {
    updateToast(recovered, { status: 'success' });
    updateToast(brief, { status: 'error', duration: 2500 });
    updateToast(sticky, { duration: null });
    updateToast(failed, { status: 'error' });
  });

  await expectClosedAfter(2499, []);
  await expectClosedAfter(1, ['Brief warning']);
  await expectClosedAfter(2500, ['Brief warning', 'Recovered']);
  expectVisibleNotifications('Keep this', 'Still failing');
});
