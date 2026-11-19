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

export class TimeSince {
  timestamp: number = Date.now();

  /** Reset timer back to 0 ms (or the given value). For example '1000' will set the timer as if it was started 1 second ago.  */
  reset(to = 0) {
    this.timestamp = Date.now() - to;
  }

  /** Time since last reset (or create) in ms */
  get value() {
    return Date.now() - this.timestamp;
  }
}
