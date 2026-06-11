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
import { render, screen } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { SqlResults } from './sql-results';
import type { QueryRunSuccess, SqlRole } from './sql-types';

const LONG_VALUE = `{"payload":"${'x'.repeat(120)}"}`;
const viewer: SqlRole = 'viewer';

const run: QueryRunSuccess = {
  state: 'success',
  token: 1,
  columns: [
    { name: 'id', type: 'TEXT', kind: 'str', short: 'text' },
    { name: 'doc', type: 'TEXT', kind: 'str', short: 'text' },
  ],
  rows: [{ id: 'row-1', doc: LONG_VALUE }],
  totalRows: 1,
  elapsedMs: 3,
  truncated: false,
};

describe('SqlResults cell clamping', () => {
  test('short values render as plain text without a click target', () => {
    render(<SqlResults role={viewer} run={run} />);
    const short = screen.getByText('row-1');
    expect(short.closest('button')).toBeNull();
  });

  test('long values truncate and open the full value in a popover on click', async () => {
    render(<SqlResults role={viewer} run={run} />);
    const trigger = screen.getByRole('button', { name: LONG_VALUE });
    expect(trigger.className).toContain('truncate');

    await userEvent.click(trigger);
    const occurrences = await screen.findAllByText(LONG_VALUE);
    expect(occurrences.length).toBeGreaterThan(1);
  });
});
