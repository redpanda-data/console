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

import { describe, expect, it } from '@rstest/core';
import { render, screen } from 'test-utils';

import { InvalidConfigNotice } from './invalid-config-notice';

describe('the InvalidConfigNotice', () => {
  it('announces invalid YAML without covering the canvas toolbars', () => {
    render(<InvalidConfigNotice>Can't visualize the latest YAML.</InvalidConfigNotice>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Can't visualize the latest YAML.");
    expect(alert).toHaveClass('w-auto');
    expect(alert).not.toHaveClass('w-full');
  });

  it('forwards positioning classes from the caller and pads by variant', () => {
    render(
      <InvalidConfigNotice className="absolute top-3 left-1/2" variant="floating">
        notice
      </InvalidConfigNotice>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('absolute', 'px-3');
    expect(alert).not.toHaveClass('px-4');
  });
});
