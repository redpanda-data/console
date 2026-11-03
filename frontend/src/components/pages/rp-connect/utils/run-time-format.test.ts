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

import { runTimeParts } from './run-time-format';
import { describe, expect, test } from 'bun:test';

describe('runTimeParts', () => {
  test('a run splits into its day, date, time and zone, in the zone asked for', () => {
    expect(runTimeParts(Date.parse('2026-10-24T09:00:00Z'), 'America/Vancouver', 'en-US')).toEqual({
      weekday: 'Sat',
      date: 'Oct 24',
      time: '2:00 AM',
      zone: 'PDT',
    });
  });
});
