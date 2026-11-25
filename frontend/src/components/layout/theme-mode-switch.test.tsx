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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, within } from '@testing-library/react';
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

afterEach(() => {
  localStorage.removeItem('redpanda-ui-theme');
  delete document.documentElement.dataset.theme;
  document.documentElement.classList.remove('dark');
  rs.restoreAllMocks();
});

describe('the ThemeModeSwitch', () => {
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

test('providers sharing the theme storage stay in sync in the same page', async () => {
  const user = userEvent.setup();
  render(
    <>
      <section aria-label="First theme">
        <ThemeProvider defaultTheme="light">
          <ThemeModeSwitch />
        </ThemeProvider>
      </section>
      <section aria-label="Second theme">
        <ThemeProvider defaultTheme="light">
          <ThemeModeSwitch />
        </ThemeProvider>
      </section>
    </>
  );
  await user.click(within(screen.getByRole('region', { name: 'First theme' })).getByRole('button', { name: 'Dark' }));
  expect(
    within(screen.getByRole('region', { name: 'Second theme' })).getByRole('button', { name: 'Dark' })
  ).toHaveAttribute('aria-pressed', 'true');
});

const systemQuery = Object.assign(new EventTarget(), {
  matches: false,
  media: '(prefers-color-scheme: dark)',
  onchange: null,
  addListener: rs.fn(),
  removeListener: rs.fn(),
});
beforeEach(() => {
  systemQuery.matches = false;
  rs.spyOn(window, 'matchMedia').mockReturnValue(systemQuery);
});
function changeSystem(dark: boolean) {
  act(() => {
    systemQuery.matches = dark;
    systemQuery.dispatchEvent(Object.assign(new Event('change'), { matches: dark, media: systemQuery.media }));
  });
}

test('system themes follow the OS, while explicit choices stay fixed', async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider defaultTheme="system">
      <ThemeModeSwitch />
    </ThemeProvider>
  );
  changeSystem(true);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  await user.click(screen.getByRole('button', { name: 'Light' }));
  changeSystem(false);
  changeSystem(true);
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('restores the existing raw-string preference and follows cross-tab changes', async () => {
  localStorage.setItem('redpanda-ui-theme', 'dark');
  renderSwitch();
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  act(() => {
    localStorage.setItem('redpanda-ui-theme', 'light');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'redpanda-ui-theme', newValue: 'light', storageArea: localStorage })
    );
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true'));
});

test('memory-only providers neither restore nor overwrite saved preferences', async () => {
  const user = userEvent.setup();
  localStorage.setItem('redpanda-ui-theme', 'light');
  render(
    <ThemeProvider defaultTheme="light" storageKey={null}>
      <ThemeModeSwitch />
    </ThemeProvider>
  );
  await user.click(screen.getByRole('button', { name: 'Dark' }));
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem('redpanda-ui-theme')).toBe('light');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'redpanda-ui-theme', newValue: 'light' })));
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
});
