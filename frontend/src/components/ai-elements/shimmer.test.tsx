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

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Shimmer } from './shimmer';

// ---------------------------------------------------------------------------
// These tests guard the module-level motion-component cache introduced when
// bumping streamdown/ai-elements. Regression here would be silent — rendering
// would start creating a fresh motion component on every render, eventually
// tearing down its animation frame — so we assert observable behaviour:
// multiple renders with the same `as` succeed, different `as` values each
// render correctly, and the `memo()` wrapper preserves the text content
// across re-renders with identical props.
// ---------------------------------------------------------------------------

describe('Shimmer', () => {
  test('renders the provided text inside a <p> by default', () => {
    render(<Shimmer>Loading</Shimmer>);
    const node = screen.getByText('Loading');
    // Default `as` is "p" — verify the cached motion component wraps in a
    // paragraph so we don't accidentally regress the DOM shape consumers
    // rely on for styling.
    expect(node.tagName).toBe('P');
  });

  test('renders with a non-default element via `as`', () => {
    render(
      <Shimmer as="span" className="my-shimmer">
        Streaming
      </Shimmer>
    );
    const node = screen.getByText('Streaming');
    expect(node.tagName).toBe('SPAN');
    expect(node.className).toContain('my-shimmer');
  });

  test('re-rendering with identical props leaves DOM node untouched (memo bails out)', () => {
    const { rerender, container } = render(<Shimmer>Hello</Shimmer>);
    const firstNode = container.firstElementChild;
    rerender(<Shimmer>Hello</Shimmer>);
    const secondNode = container.firstElementChild;
    // `memo` must return the same React element, so the DOM node reference
    // is preserved across re-renders.
    expect(secondNode).toBe(firstNode);
  });

  test('re-rendering with the same `as` across two instances does not throw', () => {
    // The module-level cache is reused across instances. Render two Shimmer
    // instances with `as="span"` and confirm both appear — if the cache
    // were incorrectly keyed, the second render could blow up or lose the
    // content.
    render(
      <>
        <Shimmer as="span">one</Shimmer>
        <Shimmer as="span">two</Shimmer>
      </>
    );
    expect(screen.getByText('one').tagName).toBe('SPAN');
    expect(screen.getByText('two').tagName).toBe('SPAN');
  });

  test('switching `as` between renders swaps element type', () => {
    // Different `as` values should produce distinct cached motion
    // components. When `as` changes, the DOM tag must change too.
    const { rerender, container } = render(<Shimmer>content</Shimmer>);
    expect(container.firstElementChild?.tagName).toBe('P');
    rerender(<Shimmer as="span">content</Shimmer>);
    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });
});
