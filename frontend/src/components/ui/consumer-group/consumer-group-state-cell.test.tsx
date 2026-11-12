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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupType } from 'types/consumer-groups';

import {
  ConsumerGroupStateCell,
  consumerGroupStateFilterOptions,
  consumerGroupStateNames,
  consumerGroupStatesByType,
} from './consumer-group-state-cell';

const lifecycleCases: Array<{ groupType: GroupType; state: string; names: string[] }> = [
  {
    groupType: 'classic',
    state: 'Stable',
    names: ['Empty', 'Preparing Rebalance', 'Completing Rebalance', 'Stable', 'Dead'],
  },
  { groupType: 'consumer', state: 'Reconciling', names: ['Empty', 'Assigning', 'Reconciling', 'Stable', 'Dead'] },
];

async function openStateTooltip(groupType: GroupType, state: string, label = state) {
  const user = userEvent.setup();
  render(<ConsumerGroupStateCell groupType={groupType} state={state} />);
  await user.hover(screen.getByText(label));
  return screen.findByTestId('consumer-group-state-tooltip');
}

describe('consumer group state cell', () => {
  test('renders the name of every known state', () => {
    const stateNames = Object.values(consumerGroupStateNames);
    for (const name of stateNames) {
      const { unmount } = render(<ConsumerGroupStateCell state={name.replace(/\s+/g, '')} />);
      expect(screen.getByText(name)).toBeInTheDocument();
      unmount();
    }
  });

  test.each(['Assigning', 'Reconciling'])('renders the KIP-848 %s state of a consumer group', (state) => {
    render(<ConsumerGroupStateCell groupType="consumer" state={state} />);
    expect(screen.getByText(state)).toBeInTheDocument();
  });

  test('falls back to Unknown for a state it does not know', () => {
    render(<ConsumerGroupStateCell state="SomethingNew" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  test('the filter options list the classic and the consumer states', () => {
    const labels = consumerGroupStateFilterOptions.map((o) => o.label);
    expect(labels).toEqual([
      'Stable',
      'Assigning',
      'Reconciling',
      'Completing Rebalance',
      'Preparing Rebalance',
      'Empty',
      'Dead',
      'Unknown',
    ]);
  });

  test('each group type lists its own states in lifecycle order', () => {
    expect(consumerGroupStatesByType.classic).toEqual([
      'empty',
      'preparingrebalance',
      'completingrebalance',
      'stable',
      'dead',
    ]);
    expect(consumerGroupStatesByType.consumer).toEqual(['empty', 'assigning', 'reconciling', 'stable', 'dead']);
  });
  test.each(lifecycleCases)(
    'shows the $groupType lifecycle and highlights its active state',
    async ({ groupType, state, names }) => {
      const tooltip = await openStateTooltip(groupType, state);
      expect(within(tooltip).getByText(`States of a ${groupType} group`)).toBeVisible();
      const rows = within(tooltip).getAllByRole('listitem');
      expect(rows).toHaveLength(names.length);
      const lifecycleNames = names.entries();
      for (const [index, name] of lifecycleNames) {
        expect(within(rows[index]).getByText(name, { exact: true })).toBeVisible();
        expect(rows[index].getAttribute('aria-current')).toBe(name === state ? 'true' : null);
      }
    }
  );

  test('includes an unknown current state after the consumer lifecycle', async () => {
    const tooltip = await openStateTooltip('consumer', 'FutureState', 'Unknown');
    const rows = within(tooltip).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows.at(-1)).toHaveTextContent('Unknown');
    expect(rows.at(-1)).toHaveAttribute('aria-current', 'true');
  });
});
