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

import { render, screen } from 'test-utils';
import { describe, expect, it } from 'vitest';

import { InvalidConfigNotice } from './invalid-config-notice';

describe('InvalidConfigNotice', () => {
  it('renders its message inside a warning alert', () => {
    render(<InvalidConfigNotice>Can't visualize the latest YAML.</InvalidConfigNotice>);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't visualize the latest YAML.");
  });

  it('stays content-width (w-auto) rather than the Alert default w-full, so the floating canvas banner does not cover the toolbars', () => {
    render(<InvalidConfigNotice>notice</InvalidConfigNotice>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('w-auto');
    expect(alert).not.toHaveClass('w-full');
  });

  it('forwards positioning/padding classes from the caller', () => {
    render(<InvalidConfigNotice className="absolute top-3 left-1/2 px-3">notice</InvalidConfigNotice>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('absolute', 'px-3');
    // Caller padding wins over the Alert's default on the same axis.
    expect(alert).not.toHaveClass('px-4');
  });
});
