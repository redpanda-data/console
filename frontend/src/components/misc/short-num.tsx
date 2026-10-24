/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { clsx } from 'clsx';
import type { CSSProperties } from 'react';

import { numberToThousandsString } from '../../utils/tsx-utils';

export function ShortNum(p: { value: number; tooltip?: boolean; className?: string; style?: CSSProperties }) {
  const { value, tooltip, className, style } = p;
  if (value === null) {
    return '';
  }
  const str = formatShortNumber(value);

  if (tooltip) {
    return (
      <div className={clsx(className, 'tooltip')} style={style}>
        {str}
        <span className="tooltiptext">{numberToThousandsString(value)}</span>
      </div>
    );
  }
  return (
    <span className={className} style={style}>
      {str}
    </span>
  );
}

function formatShortNumber(value: number): string {
  const million = 1_000_000;
  const unit = value >= million ? 'M' : value >= 1000 ? 'k' : '';
  const scaled = unit === 'M' ? value / million : unit === 'k' ? value / 1000 : value;
  const decimals = unit === 'M' ? 2 : 1;
  // Round first, then drop trailing zeroes and apply locale separators.
  return Number(scaled.toFixed(decimals)).toLocaleString() + unit;
}
