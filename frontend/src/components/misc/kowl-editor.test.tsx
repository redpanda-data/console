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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';

import KowlEditor, { KowlDiffEditor } from './kowl-editor';

const { appearance, monacoStub } = rs.hoisted(() => ({
  appearance: rs.fn((): 'light' | 'dark' => 'light'),
  monacoStub: { editor: { defineTheme: rs.fn(), setTheme: rs.fn() } },
}));

rs.mock('./monaco-editor', () => ({ default: MockEditor, DiffEditor: MockEditor }));
rs.mock('hooks/use-theme-appearance', () => ({ useThemeAppearance: appearance }));

// Monaco calls beforeMount once, with its instance, then applies the `theme` prop.
function MockEditor({ beforeMount, theme }: { beforeMount?: (monaco: typeof monacoStub) => void; theme?: string }) {
  const [mountMonaco] = useState(() => beforeMount);
  useEffect(
    function runBeforeMount() {
      mountMonaco?.(monacoStub);
    },
    [mountMonaco]
  );
  return <div data-testid="monaco" data-theme-name={theme} />;
}

describe('the Kowl editors', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    appearance.mockReturnValue('light');
  });

  test.each([
    ['KowlEditor', KowlEditor],
    ['KowlDiffEditor', KowlDiffEditor],
  ])("%s takes the token theme over the caller's, and still runs the caller's beforeMount", async (_, Editor) => {
    const callerBeforeMount = rs.fn();
    render(<Editor beforeMount={callerBeforeMount} theme="vs-light" />);

    expect(await screen.findByTestId('monaco')).toHaveAttribute('data-theme-name', 'redpanda-editor');
    await waitFor(() => expect(callerBeforeMount).toHaveBeenCalledWith(monacoStub));
    expect(monacoStub.editor.defineTheme).toHaveBeenCalledWith(
      'redpanda-editor',
      expect.objectContaining({ base: expect.any(String) })
    );
    expect(monacoStub.editor.setTheme).toHaveBeenCalledWith('redpanda-editor');
  });

  test('re-resolves the theme when the appearance flips', async () => {
    const { rerender } = render(<KowlEditor />);
    await screen.findByTestId('monaco');
    await waitFor(() => expect(monacoStub.editor.setTheme).toHaveBeenCalled());
    rs.clearAllMocks();

    appearance.mockReturnValue('dark');
    rerender(<KowlEditor />);

    await waitFor(() => expect(monacoStub.editor.defineTheme).toHaveBeenCalledTimes(1));
    expect(monacoStub.editor.setTheme).toHaveBeenCalledWith('redpanda-editor');
  });
});
