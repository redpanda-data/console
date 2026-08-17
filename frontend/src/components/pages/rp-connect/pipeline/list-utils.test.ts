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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import {
  aggregateConnectors,
  countPipelinesPerTab,
  matchesNameOrId,
  PIPELINE_STATE_TABS,
  pipelineListEmptyText,
  stateFilterValues,
} from './list-utils';

describe('aggregateConnectors', () => {
  it('collapses duplicates into counts, preserving first-appearance order', () => {
    expect(aggregateConnectors(['redpanda', 'redpanda', 's3', 'redpanda', 'http_client'])).toEqual([
      { name: 'redpanda', count: 3 },
      { name: 's3', count: 1 },
      { name: 'http_client', count: 1 },
    ]);
  });

  it('returns an empty array for no connectors', () => {
    expect(aggregateConnectors([])).toEqual([]);
  });

  it('keeps single connectors at count 1', () => {
    expect(aggregateConnectors(['generate'])).toEqual([{ name: 'generate', count: 1 }]);
  });
});

describe('PIPELINE_STATE_TABS', () => {
  it('assigns transitional states to their destination tab', () => {
    const running = PIPELINE_STATE_TABS.find((t) => t.id === 'running');
    const stopped = PIPELINE_STATE_TABS.find((t) => t.id === 'stopped');
    expect(running?.states).toContain(Pipeline_State.STARTING);
    expect(stopped?.states).toContain(Pipeline_State.STOPPING);
  });

  it('covers every state except UNSPECIFIED across the non-all tabs', () => {
    const covered = new Set(PIPELINE_STATE_TABS.flatMap((t) => t.states ?? []));
    const allStates = Object.values(Pipeline_State).filter((v): v is Pipeline_State => typeof v === 'number');
    for (const state of allStates) {
      if (state !== Pipeline_State.UNSPECIFIED) {
        expect(covered).toContain(state);
      }
    }
  });
});

describe('countPipelinesPerTab', () => {
  it('counts states per tab with all as the total', () => {
    const counts = countPipelinesPerTab([
      Pipeline_State.RUNNING,
      Pipeline_State.STARTING,
      Pipeline_State.STOPPED,
      Pipeline_State.ERROR,
      Pipeline_State.UNSPECIFIED,
    ]);
    expect(counts).toEqual({ all: 5, draft: 0, running: 2, stopped: 1, error: 1 });
  });

  it('counts drafts into the drafts tab and the total, never into a run state', () => {
    const counts = countPipelinesPerTab([
      Pipeline_State.DRAFT,
      Pipeline_State.DRAFT,
      Pipeline_State.RUNNING,
      Pipeline_State.STOPPED,
    ]);
    expect(counts).toEqual({ all: 4, draft: 2, running: 1, stopped: 1, error: 0 });
  });
});

describe('stateFilterValues', () => {
  it('leaves the All tab unfiltered', () => {
    const all = PIPELINE_STATE_TABS.find((t) => t.id === 'all');
    expect(all && stateFilterValues(all)).toBeUndefined();
  });

  it('filters the Drafts tab on the draft state alone', () => {
    const drafts = PIPELINE_STATE_TABS.find((t) => t.id === 'draft');
    expect(drafts && stateFilterValues(drafts)).toEqual([String(Pipeline_State.DRAFT)]);
  });

  it('stringifies pipeline states to match the status column accessor', () => {
    const running = PIPELINE_STATE_TABS.find((t) => t.id === 'running');
    expect(running && stateFilterValues(running)).toEqual([
      String(Pipeline_State.RUNNING),
      String(Pipeline_State.STARTING),
    ]);
  });
});

describe('pipelineListEmptyText', () => {
  it('reports the filter miss whenever filters are active', () => {
    expect(pipelineListEmptyText({ hasActiveFilters: true, activeTab: 'all', totalPipelines: 12 })).toBe(
      'No pipelines match the current filters'
    );
  });

  it('stays silent on an unfiltered All view that still has pipelines (page index about to clamp)', () => {
    expect(pipelineListEmptyText({ hasActiveFilters: false, activeTab: 'all', totalPipelines: 12 })).toBeNull();
  });

  it('uses the tab copy for an empty tab and for no pipelines at all', () => {
    expect(pipelineListEmptyText({ hasActiveFilters: false, activeTab: 'error', totalPipelines: 12 })).toBe(
      'No pipelines with errors'
    );
    expect(pipelineListEmptyText({ hasActiveFilters: false, activeTab: 'all', totalPipelines: 0 })).toBe(
      'You have no Redpanda Connect pipelines'
    );
  });
});

describe('matchesNameOrId', () => {
  it('matches case-insensitively on name and id', () => {
    expect(matchesNameOrId('ORDERS', 'orders-enrichment', 'd9abc')).toBe(true);
    expect(matchesNameOrId('d9ab', 'orders-enrichment', 'D9ABC')).toBe(true);
    expect(matchesNameOrId('nope', 'orders-enrichment', 'd9abc')).toBe(false);
  });

  it('treats blank searches as match-all', () => {
    expect(matchesNameOrId('   ', 'anything', 'id')).toBe(true);
  });
});
