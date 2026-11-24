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

import { describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { useState } from 'react';
import { render, screen } from 'test-utils';

import { SchemaContextSelector } from './schema-context-selector';
import { ALL_CONTEXT_ID, DEFAULT_CONTEXT_ID, type DerivedContext } from './schema-context-utils';

const ALL_OPTION = /^All /u;

function ContextSelector({ contexts, initialContext }: { contexts: DerivedContext[]; initialContext: string }) {
  const [selectedContext, setSelectedContext] = useState(initialContext);

  return (
    <TooltipProvider>
      <SchemaContextSelector
        contexts={contexts}
        onContextChange={setSelectedContext}
        selectedContext={selectedContext}
      />
    </TooltipProvider>
  );
}

function renderSelector(initialContext: string) {
  return render(<ContextSelector contexts={makeContexts()} initialContext={initialContext} />);
}

const makeContexts = () => [
  { id: DEFAULT_CONTEXT_ID, label: 'Default', subjectCount: 2, mode: 'READWRITE', compatibility: 'BACKWARD' },
  { id: '.staging', label: '.staging', subjectCount: 3, mode: 'READWRITE', compatibility: 'FULL' },
  { id: ALL_CONTEXT_ID, label: 'All', subjectCount: 5, mode: 'READWRITE', compatibility: 'BACKWARD' },
];

describe('the SchemaContextSelector', () => {
  test('renders selected context label in trigger button', () => {
    renderSelector(DEFAULT_CONTEXT_ID);

    const trigger = screen.getByTestId('schema-context-selector');
    expect(trigger).toHaveTextContent('Default');
  });

  test('falls back to "All" label when selectedContext not in contexts', () => {
    renderSelector('nonexistent');

    const trigger = screen.getByTestId('schema-context-selector');
    expect(trigger).toHaveTextContent('All');
  });

  test('opens popover on button click and shows all context options', async () => {
    const user = userEvent.setup();
    renderSelector(ALL_CONTEXT_ID);

    await user.click(screen.getByTestId('schema-context-selector'));

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('.staging')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: ALL_OPTION })).toBeInTheDocument();
  });

  test('updates the selected context and closes the options on selection', async () => {
    const user = userEvent.setup();
    renderSelector(ALL_CONTEXT_ID);

    await user.click(screen.getByTestId('schema-context-selector'));
    await user.click(screen.getByText('.staging'));

    expect(screen.getByTestId('schema-context-selector')).toHaveTextContent('.staging');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  test('displays subject count per context', async () => {
    const user = userEvent.setup();
    renderSelector(ALL_CONTEXT_ID);

    await user.click(screen.getByTestId('schema-context-selector'));

    expect(screen.getByText('2 subjects')).toBeInTheDocument();
    expect(screen.getByText('3 subjects')).toBeInTheDocument();
    expect(screen.getByText('5 subjects')).toBeInTheDocument();
  });
});
