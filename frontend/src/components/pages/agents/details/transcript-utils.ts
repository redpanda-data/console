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

import type { Duration } from '@bufbuild/protobuf/wkt';
import { durationMs } from '@bufbuild/protobuf/wkt';

export const formatDuration = (d?: Duration): string => {
  if (!d) {
    return '—';
  }
  const ms = durationMs(d);
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

export const formatTimestamp = (ts?: { seconds: bigint }): string => {
  if (!ts) {
    return '—';
  }
  return new Date(Number(ts.seconds) * 1000).toLocaleString();
};
