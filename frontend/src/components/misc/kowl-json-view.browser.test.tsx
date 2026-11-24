// Copyright 2026 Redpanda Data, Inc.

import { expect, test } from '@rstest/core';
import { render, waitFor } from '@testing-library/react';
import { editor } from 'monaco-editor';

import { KowlJsonView } from './kowl-json-view';

const initialSize = { width: 640, height: 384 };
const resized = { width: 800, height: 480 };

function mountedEditor(container: HTMLElement) {
  return waitFor(() => {
    const instance = editor.getEditors().find((item) => container.contains(item.getContainerDomNode()));
    if (!instance) {
      throw new Error('Waiting for the Monaco editor');
    }
    return instance;
  });
}

test('renders a lightweight read-only editor that follows its container’s real dimensions', async () => {
  const payload = { market: 'BSEX' };
  const { container, rerender } = render(<KowlJsonView srcObj={payload} style={initialSize} />);
  const instance = await mountedEditor(container);
  expect(instance.getRawOptions()).toMatchObject({
    readOnly: true,
    domReadOnly: true,
    automaticLayout: false,
    folding: false,
    lineNumbers: 'off',
    hover: { enabled: false },
    stickyScroll: { enabled: false },
    wordWrap: 'wordWrapColumn',
    wordWrapColumn: 120,
  });
  await waitFor(() => expect(instance.getLayoutInfo()).toMatchObject(initialSize));

  rerender(<KowlJsonView srcObj={payload} style={resized} />);

  await waitFor(() => expect(instance.getLayoutInfo()).toMatchObject(resized));
  expect(JSON.parse(instance.getValue())).toEqual(payload);
});

test('preserves Latin-1 byte escapes only when requested', async () => {
  const payload = { v: 'ÛN' };
  const { container, rerender } = render(<KowlJsonView escapeLatin1 srcObj={payload} style={initialSize} />);
  const instance = await mountedEditor(container);
  expect(instance.getValue()).toContain('\\u00db');
  expect(instance.getValue()).not.toContain('Û');

  rerender(<KowlJsonView srcObj={payload} style={initialSize} />);

  await waitFor(() => expect(instance.getValue()).toContain('Û'));
  expect(instance.getValue()).not.toContain('\\u00db');
});
