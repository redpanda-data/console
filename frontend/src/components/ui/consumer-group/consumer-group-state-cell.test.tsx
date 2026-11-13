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
import { render, screen } from 'test-utils';

import {
  ConsumerGroupStateCell,
  consumerGroupStateFilterOptions,
  consumerGroupStateNames,
  consumerGroupStatesByType,
} from './consumer-group-state-cell';

describe('ConsumerGroupStateCell', () => {
  test('renders the name of every known state', () => {
    for (const name of Object.values(consumerGroupStateNames)) {
      const { unmount } = render(<ConsumerGroupStateCell state={name.replace(/\s+/g, '')} />);
      expect(screen.getByText(name)).toBeInTheDocument();
      unmount();
    }
  });

  test('renders the two KIP-848 states of a consumer group', () => {
    render(<ConsumerGroupStateCell groupType="consumer" state="Reconciling" />);
    expect(screen.getByText('Reconciling')).toBeInTheDocument();
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
    expect(consumerGroupStatesByType.classic).toEqual(['empty', 'preparingrebalance', 'completingrebalance', 'stable', 'dead']);
    expect(consumerGroupStatesByType.consumer).toEqual(['empty', 'assigning', 'reconciling', 'stable', 'dead']);
  });
});
