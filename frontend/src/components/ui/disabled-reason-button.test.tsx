/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { DisabledReasonButton } from './disabled-reason-button';

describe('DisabledReasonButton', () => {
  test('renders an enabled button when no reason is given', async () => {
    const user = userEvent.setup();
    let clicked = false;

    render(
      <DisabledReasonButton onClick={() => (clicked = true)} testId="edit">
        Edit
      </DisabledReasonButton>
    );

    await user.click(screen.getByTestId('edit'));

    expect(clicked).toBe(true);
  });

  test('exposes the reason via a tooltip on hover when disabled', async () => {
    const user = userEvent.setup();

    render(
      <DisabledReasonButton iconOnly reason="No committed offset" testId="edit">
        Edit
      </DisabledReasonButton>
    );

    await user.hover(screen.getByTestId('edit'));

    // role=tooltip is what the E2E assertions rely on; Base UI's popup does not set it itself.
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('No committed offset'));
  });

  test('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    let clicked = false;

    render(
      <DisabledReasonButton onClick={() => (clicked = true)} reason="No committed offset" testId="edit">
        Edit
      </DisabledReasonButton>
    );

    await user.click(screen.getByTestId('edit'));

    expect(clicked).toBe(false);
  });
});
