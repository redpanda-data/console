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

import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('config', () => ({ config: { clusterId: 'cluster-a' } }));

import { RUN_HISTORY_STORAGE_KEY, useRunHistoryStore } from './rpcn-run-history-preview';

const NOW = Date.UTC(2026, 9, 29, 12);
const KEY = 'cluster-a/p1';

const stored = () => JSON.parse(localStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? '{}');

beforeEach(() => {
  localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
  useRunHistoryStore.setState({ runs: {} });
});

describe('the run history preview store', () => {
  it('records a start under the pipeline', () => {
    useRunHistoryStore.getState().startManualRun('p1', { now: NOW });
    expect(stored()[KEY]).toEqual([{ id: `manual-${NOW}`, startTime: NOW, outcome: 'running', trigger: 'manual' }]);
  });

  // Another tab on a newer version can write runs this one can't read.
  it('leaves a run list it cannot read as stored', () => {
    const newer = [
      { id: 'a', startTime: NOW - 1000, outcome: 'cancelled', trigger: 'manual' },
      { id: 'b', startTime: NOW - 5000, endTime: NOW - 2000, outcome: 'completed', trigger: 'manual' },
    ];
    localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({ [KEY]: newer }));
    useRunHistoryStore.getState().startManualRun('p1', { now: NOW });
    useRunHistoryStore.getState().replaceRuns('p1', []);
    expect(stored()[KEY]).toEqual(newer);
  });
});
