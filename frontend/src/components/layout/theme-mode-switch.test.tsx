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
import { ThemeProvider } from 'components/redpanda-ui/components/theme-provider';
import { render, screen, waitFor } from 'test-utils';

import { ThemeModeSwitch } from './theme-mode-switch';

const renderSwitch = () =>
  render(
    <ThemeProvider defaultTheme="light">
      <ThemeModeSwitch />
    </ThemeProvider>
  );

describe('the ThemeModeSwitch', () => {
  afterEach(() => {
    localStorage.removeItem('redpanda-ui-theme');
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove('dark');
  });

  test('offers System, Light and Dark, with the stored preference pressed', () => {
    renderSwitch();

    expect(screen.getAllByRole('button').map((option) => option.getAttribute('aria-label'))).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ColorModeSwitch-dark')).toHaveAccessibleName('Dark');
  });

  test('stores the choice and applies it to the document', async () => {
    const user = userEvent.setup();
    renderSwitch();

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('redpanda-ui-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps the chosen option pressed when it is selected again', async () => {
    const user = userEvent.setup();
    renderSwitch();

    await user.click(screen.getByRole('button', { name: 'System' }));
    await user.click(screen.getByRole('button', { name: 'System' }));

    expect(localStorage.getItem('redpanda-ui-theme')).toBe('system');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  });
});
