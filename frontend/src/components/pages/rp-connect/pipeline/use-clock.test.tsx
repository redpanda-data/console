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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render } from 'test-utils';

import { useClock } from './use-clock';

const ClockProbe = ({ seen }: { seen: number[] }) => {
  seen.push(useClock());
  return null;
};

describe('the shared clock', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    return () => {
      rs.useRealTimers();
    };
  });

  // Nothing ticks the clock while no label is shown.
  test('a label shown after a while with none on the page starts from the time now', () => {
    render(<ClockProbe seen={[]} />).unmount();
    rs.setSystemTime(Date.now() + 3 * 60 * 60_000);
    const seen: number[] = [];
    render(<ClockProbe seen={seen} />);
    expect(seen[0]).toBe(Date.now());
  });
});
