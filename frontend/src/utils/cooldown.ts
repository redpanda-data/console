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

export class Cooldown {
  timestamp = 0; // time of last trigger
  duration = 0; // how long the CD takes to charge

  /**
   * @description Create a cooldown with the given duration
   * @param duration time the cooldown takes to complete in ms
   * @param start `running` to start 'on cooldown', `ready` to start already charged
   */
  constructor(duration: number, start: 'ready' | 'running' = 'running') {
    this.duration = duration;
    if (start === 'running') {
      this.timestamp = Date.now();
    }
  }

  /** Time (in ms) since the last time the cooldown was triggered */
  timeSinceLastTrigger() {
    return Date.now() - this.timestamp;
  }

  /** Time (in ms) until the cooldown is ready (or 0 if it is) */
  get timeLeft() {
    const t = this.duration - this.timeSinceLastTrigger();
    if (t < 0) {
      return 0;
    }
    return t;
  }

  get isReady() {
    return this.timeLeft <= 0;
  }

  // 'Use' the cooldown. Check if ready, and if it is also trigger it
  consume(force = false) {
    if (this.timeLeft <= 0 || force) {
      this.timestamp = Date.now();
      return true;
    }
    return false;
  }

  setReady() {
    this.timestamp = 0;
  }

  restart() {
    this.timestamp = Date.now();
  }
}
