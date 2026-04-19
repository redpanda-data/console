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

import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Response } from './response';

// ---------------------------------------------------------------------------
// Regression guards for the streamdown v2 bump. v2 replaced several remark /
// rehype internals for CJK and KaTeX support — we assert that basic markdown
// still renders, that fenced code blocks survive the pipeline, and that the
// memoised wrapper bails out on identical children.
// ---------------------------------------------------------------------------

describe('Response', () => {
  test('renders a plain paragraph from basic markdown', () => {
    const { container } = render(<Response>hello world</Response>);
    // streamdown v2 should still produce a paragraph for bare text input.
    const paragraph = container.querySelector('p');
    expect(paragraph).not.toBeNull();
    expect((paragraph?.textContent ?? '').trim()).toBe('hello world');
  });

  test('renders bold markdown with the text preserved', () => {
    const { container } = render(<Response>**bold text**</Response>);
    // streamdown v2's streaming pipeline may defer wrapping until the
    // marker closes; we mainly want to guarantee the raw text survives the
    // sanitiser / highlighter roundtrip without losing characters.
    expect((container.textContent ?? '').includes('bold text')).toBe(true);
  });

  test('renders fenced code blocks inside a <pre><code>', () => {
    const { container } = render(
      <Response>{'```ts\nconst x = 1;\n```'}</Response>
    );
    // The syntax-highlighting pipeline must still produce a <pre><code>
    // structure; streamdown v2 swaps internals but the public shape should
    // hold.
    const pre = container.querySelector('pre');
    const code = container.querySelector('pre code');
    expect(pre).not.toBeNull();
    expect(code).not.toBeNull();
    expect((code?.textContent ?? '').includes('const x = 1')).toBe(true);
  });

  test('memo bails out and preserves DOM identity when children unchanged', () => {
    const { container, rerender } = render(<Response>stable content</Response>);
    const first = container.firstElementChild;
    rerender(<Response>stable content</Response>);
    const second = container.firstElementChild;
    // The custom propsAreEqual in `response.tsx` compares `children`; when it
    // matches, React skips the re-render and the DOM node stays referentially
    // identical.
    expect(second).toBe(first);
  });

  test('memo re-renders when children change', () => {
    const { container, rerender } = render(<Response>first</Response>);
    rerender(<Response>second</Response>);
    // Content must update when `children` changes, otherwise streaming output
    // would freeze on the first chunk.
    expect((container.textContent ?? '').includes('second')).toBe(true);
  });
});
