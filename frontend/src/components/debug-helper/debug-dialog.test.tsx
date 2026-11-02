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

import { afterEach, describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';

import { DebugDialog } from './debug-dialog';
import { getOverrides } from './feature-flag-overrides';
import { config } from '../../config';

const DARK_MODE_TOGGLE_ID = 'flag-toggle-enableDarkMode';

const openFlagsPanel = async () => {
  const user = userEvent.setup();
  render(<DebugDialog onOpenChange={() => undefined} open />);
  await user.click(await screen.findByRole('button', { name: 'Feature flags' }));
  await screen.findByText('enableDarkMode');
  return user;
};

/** Base UI puts the `id` on its hidden checkbox; the visible control is the labelled `role="switch"`. */
const darkModeSwitch = () => {
  const control = document.querySelector(`[role="switch"][aria-labelledby="${DARK_MODE_TOGGLE_ID}-label"]`);
  if (!control) {
    throw new Error('enableDarkMode switch not rendered');
  }
  return control;
};

describe('debug dialog feature flags', () => {
  afterEach(() => {
    config.jwt = undefined;
    localStorage.removeItem('__debug_feature_flag_overrides');
  });

  test('embedded: enableDarkMode is locked and points at Cloud UI', async () => {
    config.jwt = 'host-token';
    const user = await openFlagsPanel();

    expect(document.getElementById(DARK_MODE_TOGGLE_ID)).toBeDisabled();
    expect(screen.getByTestId('flag-host-owned-enableDarkMode')).toHaveTextContent(
      "Embedded Console follows Cloud UI's theme. Override enable-dark-mode in Cloud UI's debug dialog."
    );

    await user.click(darkModeSwitch());
    expect(getOverrides()).toEqual({});
  });

  test('standalone: enableDarkMode is an ordinary override', async () => {
    const user = await openFlagsPanel();

    expect(document.getElementById(DARK_MODE_TOGGLE_ID)).toBeEnabled();
    expect(screen.queryByTestId('flag-host-owned-enableDarkMode')).not.toBeInTheDocument();

    await user.click(darkModeSwitch());
    expect(getOverrides()).toEqual({ enableDarkMode: true });
  });
});
