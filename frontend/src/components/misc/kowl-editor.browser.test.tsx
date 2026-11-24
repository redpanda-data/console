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

import { expect, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from 'components/redpanda-ui/components/theme-provider';

import KowlEditor, { KowlDiffEditor, type Monaco } from './kowl-editor';

function ThemeControl() {
  const { setTheme } = useTheme();
  return (
    <button onClick={() => setTheme('dark')} type="button">
      Use dark theme
    </button>
  );
}

test.each([
  ['code', KowlEditor],
  ['diff', KowlDiffEditor],
] as const)(
  'the %s editor applies the app theme instead of the caller’s and exposes Monaco before mount',
  async (_, Editor) => {
    const runtime: Monaco[] = [];
    const { container, unmount } = render(
      <ThemeProvider defaultTheme="light" storageKey={null}>
        <Editor beforeMount={(sdk) => runtime.push(sdk)} height="240px" theme="vs-dark" />
      </ThemeProvider>
    );

    await waitFor(() => expect(container.querySelector('.monaco-editor.vs')).not.toBeNull());
    expect(runtime).toHaveLength(1);
    const models = runtime[0]?.editor.getModels() ?? [];
    expect(models.length).toBeGreaterThan(0);

    unmount();
    expect(models.every((model) => model.isDisposed())).toBe(true);
  }
);

test('repaints an already mounted Monaco editor when appearance changes', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ThemeProvider defaultTheme="light" storageKey={null}>
      <ThemeControl />
      <KowlEditor height="240px" value="console theme" />
    </ThemeProvider>
  );

  await waitFor(() => expect(container.querySelector('.monaco-editor.vs')).not.toBeNull());
  const editor = container.querySelector('.monaco-editor');

  await user.click(screen.getByRole('button', { name: 'Use dark theme' }));

  await waitFor(() => expect(container.querySelector('.monaco-editor.vs-dark')).toBe(editor));
});
