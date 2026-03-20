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

import userEvent from '@testing-library/user-event';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { render, screen } from 'test-utils';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import { SchemaContextSelector } from './schema-context-selector';
import { ALL_CONTEXT_ID, DEFAULT_CONTEXT_ID, type DerivedContext } from './schema-context-utils';

// jsdom polyfills needed by Radix Popover + cmdk
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
});

function renderSelector(props: { contexts: DerivedContext[]; selectedContext: string; onContextChange: () => void }) {
  return render(
    <TooltipProvider>
      <SchemaContextSelector {...props} />
    </TooltipProvider>
  );
}

const makeContexts = (): DerivedContext[] => [
  { id: DEFAULT_CONTEXT_ID, label: 'Default', subjectCount: 2, mode: 'READWRITE', compatibility: 'BACKWARD' },
  { id: '.staging', label: '.staging', subjectCount: 3, mode: 'READWRITE', compatibility: 'FULL' },
  { id: ALL_CONTEXT_ID, label: 'All', subjectCount: 5, mode: 'READWRITE', compatibility: 'BACKWARD' },
];

describe('SchemaContextSelector', () => {
  test('renders selected context label in trigger button', () => {
    renderSelector({ contexts: makeContexts(), onContextChange: vi.fn(), selectedContext: DEFAULT_CONTEXT_ID });

    const trigger = screen.getByTestId('schema-context-selector');
    expect(trigger).toHaveTextContent('Default');
  });

  test('falls back to "All" label when selectedContext not in contexts', () => {
    renderSelector({ contexts: makeContexts(), onContextChange: vi.fn(), selectedContext: 'nonexistent' });

    const trigger = screen.getByTestId('schema-context-selector');
    expect(trigger).toHaveTextContent('All');
  });

  test('opens popover on button click and shows all context options', async () => {
    const user = userEvent.setup();
    renderSelector({ contexts: makeContexts(), onContextChange: vi.fn(), selectedContext: ALL_CONTEXT_ID });

    await user.click(screen.getByTestId('schema-context-selector'));

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('.staging')).toBeInTheDocument();
    // "All" appears both in the trigger button and the popover list
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(2);
  });

  test('calls onContextChange with correct id when option selected', async () => {
    const user = userEvent.setup();
    const onContextChange = vi.fn();
    renderSelector({ contexts: makeContexts(), onContextChange, selectedContext: ALL_CONTEXT_ID });

    await user.click(screen.getByTestId('schema-context-selector'));
    await user.click(screen.getByText('.staging'));

    expect(onContextChange).toHaveBeenCalledWith('.staging');
  });

  test('displays subject count per context', async () => {
    const user = userEvent.setup();
    renderSelector({ contexts: makeContexts(), onContextChange: vi.fn(), selectedContext: ALL_CONTEXT_ID });

    await user.click(screen.getByTestId('schema-context-selector'));

    expect(screen.getByText('2 subjects')).toBeInTheDocument();
    expect(screen.getByText('3 subjects')).toBeInTheDocument();
    expect(screen.getByText('5 subjects')).toBeInTheDocument();
  });
});
