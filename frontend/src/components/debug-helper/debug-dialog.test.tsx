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
import { render, screen, within } from 'test-utils';

import { DebugDialog } from './debug-dialog';

const openConfigs = async () => {
  const user = userEvent.setup();
  render(<DebugDialog onOpenChange={() => undefined} open />);
  await user.click(screen.getByRole('button', { name: 'Configs' }));
  // The panels swap once the previous one has animated out.
  await screen.findByRole('region', { name: 'Simple' });
  return user;
};

const sectionNames = () => screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'));

describe('DebugDialog — Connect configs', () => {
  test('lists the configs under a heading per group', async () => {
    await openConfigs();
    expect(sectionNames()).toEqual(['Simple', 'Medium', 'Complex', 'Edge cases', 'Stop conditions', 'Invalid']);
    // A stop-condition config lists under Stop conditions and keeps its other tag as a badge.
    const stops = screen.getByRole('region', { name: 'Stop conditions' });
    expect(within(stops).getByText('Stop conditions that never fire')).toBeInTheDocument();
    expect(within(stops).getAllByText('edge-case').length).toBeGreaterThan(0);
  });

  test('narrows to one group, and filters by a secret name', async () => {
    const user = await openConfigs();
    await user.click(screen.getByRole('button', { name: 'Stops' }));
    expect(sectionNames()).toEqual(['Stop conditions']);

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('textbox', { name: /filter configs/i }), 'RESTART_INPUT');
    expect(sectionNames()).toEqual(['Stop conditions']);
    expect(screen.getByText('Read-only stop conditions')).toBeInTheDocument();
  });

  test('shows a config’s YAML and the secrets it needs when expanded', async () => {
    const user = await openConfigs();
    await user.click(screen.getByRole('button', { name: 'Show the YAML for Topic backfill (limit + idle backstop)' }));
    expect(screen.getByText(/needs the secrets/)).toBeInTheDocument();
    expect(screen.getByText('KAFKA_USER')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide the YAML for Topic backfill (limit + idle backstop)' })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
