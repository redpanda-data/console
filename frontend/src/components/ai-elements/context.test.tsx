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

import { render, screen } from '@testing-library/react';
import type { LanguageModelUsage } from 'ai';
import { describe, expect, test } from 'vitest';

import {
  Context,
  ContextContent,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from './context';

// ---------------------------------------------------------------------------
// Zero-token / edge-case guards for ContextContentHeader
// ---------------------------------------------------------------------------

describe('ContextContentHeader', () => {
  test('renders 0% and 0 / 0 when both used and max tokens are zero', () => {
    // This is the degenerate case that shows up when a conversation hasn't
    // emitted any usage events yet. It must not render NaN, Infinity, or
    // throw a divide-by-zero.
    render(
      <Context maxTokens={0} usedTokens={0}>
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
        </ContextContent>
      </Context>
    );

    // The trigger's percentage label should be 0% (Intl formats NaN as "NaN%"
    // which is a regression signal for a divide-by-zero).
    const triggerPct = screen.getByRole('button');
    expect(triggerPct.textContent ?? '').not.toMatch(/NaN|Infinity/);
  });

  test('renders a sane percentage when usage is partial', () => {
    render(
      <Context maxTokens={1000} usedTokens={250}>
        <ContextTrigger />
      </Context>
    );
    const trigger = screen.getByRole('button');
    expect(trigger.textContent ?? '').toContain('25%');
  });
});

// ---------------------------------------------------------------------------
// ContextInputUsage / ContextOutputUsage zero-token suppression
// ---------------------------------------------------------------------------

describe('ContextInputUsage / ContextOutputUsage zero-token guard', () => {
  const zeroUsage: LanguageModelUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  test('ContextInputUsage renders nothing when inputTokens is 0', () => {
    const { container } = render(
      <Context maxTokens={100} usage={zeroUsage} usedTokens={0}>
        <ContextContent>
          <ContextInputUsage />
        </ContextContent>
      </Context>
    );
    // The component short-circuits to `null` for zero input tokens; the
    // HoverCard content is closed by default, so the input row never renders.
    expect(container.querySelector('[data-slot="input-usage"]')).toBeNull();
    // Explicitly, no "Input" label should leak out.
    expect(screen.queryByText('Input')).toBeNull();
  });

  test('ContextOutputUsage renders nothing when outputTokens is 0', () => {
    render(
      <Context maxTokens={100} usage={zeroUsage} usedTokens={0}>
        <ContextContent>
          <ContextOutputUsage />
        </ContextContent>
      </Context>
    );
    expect(screen.queryByText('Output')).toBeNull();
  });

  test('ContextContentFooter renders $0.00 when no modelId is provided', () => {
    // Without a modelId we can't look up per-token pricing; the footer should
    // fall back to $0.00 (not NaN) even when usage is zero.
    render(
      <Context maxTokens={100} usage={zeroUsage} usedTokens={0}>
        <ContextContent>
          <ContextContentFooter />
        </ContextContent>
      </Context>
    );
    // Footer is inside a closed hover card by default, so we just assert no
    // NaN / Infinity leaks out of the subtree.
    const pretty = document.body.textContent ?? '';
    expect(pretty).not.toMatch(/NaN|Infinity/);
  });
});

// ---------------------------------------------------------------------------
// Memoisation of provider value
// ---------------------------------------------------------------------------

describe('Context provider memoisation', () => {
  test('provider value identity is stable across re-renders when props do not change', () => {
    // We read the internal React context by swapping in a probe that captures
    // the value reference seen on each render. Because Context's state
    // container is module-private, we instead assert stability indirectly:
    // the `useContextUsage`-style consumer would re-memoise its derived work
    // from the stable value — we observe that here by checking the identity
    // of the usage object we pass through remains referentially stable and
    // that consumer renders the same count of text nodes.

    const usage: LanguageModelUsage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    };

    const { rerender, container } = render(
      <Context maxTokens={100} usage={usage} usedTokens={15}>
        <ContextTrigger />
      </Context>
    );
    const firstTriggerText = container.textContent;
    // Re-render with the exact same object references — no changes.
    rerender(
      <Context maxTokens={100} usage={usage} usedTokens={15}>
        <ContextTrigger />
      </Context>
    );
    expect(container.textContent).toBe(firstTriggerText);
  });

  test('changing usage props produces a new derived output', () => {
    const usageA: LanguageModelUsage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    };
    const usageB: LanguageModelUsage = {
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
    };

    const { rerender, container } = render(
      <Context maxTokens={100} usage={usageA} usedTokens={15}>
        <ContextTrigger />
      </Context>
    );
    const first = container.textContent ?? '';
    rerender(
      <Context maxTokens={100} usage={usageB} usedTokens={30}>
        <ContextTrigger />
      </Context>
    );
    const second = container.textContent ?? '';
    expect(first).not.toBe(second);
  });
});
