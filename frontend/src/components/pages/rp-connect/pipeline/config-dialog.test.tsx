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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from 'test-utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigDialog } from './config-dialog';
import { MIN_TASKS } from '../tasks';

const schema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  computeUnits: z.number().min(MIN_TASKS).int(),
  tags: z.array(z.object({ key: z.string().min(1), value: z.string() })).default([]),
});

type FormValues = z.infer<typeof schema>;

function TestWrapper({ defaultValues }: { defaultValues?: Partial<FormValues> }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      computeUnits: 1,
      tags: [],
      ...defaultValues,
    },
  });

  return <ConfigDialog form={form} mode="create" onOpenChange={() => {}} open />;
}

describe('ConfigDialog', () => {
  it('renders pipeline name input, accepts text', async () => {
    const user = userEvent.setup();
    render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Enter pipeline name');
    expect(input).toBeInTheDocument();
    await user.type(input, 'my-pipeline');
    expect(input).toHaveValue('my-pipeline');
  });

  it('renders description textarea', () => {
    render(<TestWrapper />);
    expect(screen.getByPlaceholderText('Optional description for this pipeline')).toBeInTheDocument();
  });

  it('renders compute units slider and number input', () => {
    render(<TestWrapper />);
    expect(screen.getByText('Compute units')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('compute units slider and number input stay in sync', async () => {
    render(<TestWrapper defaultValues={{ computeUnits: 3 }} />);
    const numberInput = screen.getByRole('spinbutton');
    expect(numberInput).toHaveValue(3);
  });

  it('renders tags section with "Tags" label', () => {
    render(<TestWrapper />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('add tag button creates a new row', async () => {
    const user = userEvent.setup();
    render(<TestWrapper defaultValues={{ tags: [{ key: '', value: '' }] }} />);
    const addButton = screen.getByRole('button', { name: /add tag/i });
    await user.click(addButton);
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(2);
      expect(screen.getAllByPlaceholderText('Value')).toHaveLength(2);
    });
  });

  it('delete button removes a tag row', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper
        defaultValues={{
          tags: [
            { key: 'env', value: 'prod' },
            { key: 'team', value: 'platform' },
          ],
        }}
      />
    );
    const keyInputs = screen.getAllByPlaceholderText('Key');
    expect(keyInputs).toHaveLength(2);

    const removeButtons = screen.getAllByRole('button', { name: /delete key-value pair/i });
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(1);
    });
  });

  it('tag key and value inputs are editable', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper
        defaultValues={{
          tags: [{ key: '', value: '' }],
        }}
      />
    );
    const keyInput = screen.getByPlaceholderText('Key');
    const valueInput = screen.getByPlaceholderText('Value');
    await user.type(keyInput, 'env');
    await user.type(valueInput, 'production');
    expect(keyInput).toHaveValue('env');
    expect(valueInput).toHaveValue('production');
  });

  it('tag key input is rendered and editable', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper
        defaultValues={{
          tags: [{ key: '', value: '' }],
        }}
      />
    );
    const keyInput = screen.getByPlaceholderText('Key');
    expect(keyInput).toBeInTheDocument();
    await user.type(keyInput, 'test');
    expect(keyInput).toHaveValue('test');
  });
});
