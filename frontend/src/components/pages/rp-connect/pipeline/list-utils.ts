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

export type ConnectorCount = {
  name: string;
  count: number;
};

/** ["redpanda", "redpanda", "s3"] → [{ name: "redpanda", count: 2 }, { name: "s3", count: 1 }]. */
export function aggregateConnectors(names: string[]): ConnectorCount[] {
  const byName = new Map<string, ConnectorCount>();
  for (const name of names) {
    const existing = byName.get(name);
    if (existing) {
      existing.count += 1;
    } else {
      byName.set(name, { name, count: 1 });
    }
  }
  return [...byName.values()];
}

export type PipelineStateTabId = 'all' | 'running' | 'stopped' | 'error';

export type PipelineStateTab = {
  id: PipelineStateTabId;
  label: string;
  /** States the tab shows; undefined means no state filtering. */
  states?: Pipeline_State[];
  emptyText: string;
};

// Transitional states ride with their destination: starting counts as running, stopping as stopped.
export const PIPELINE_STATE_TABS: PipelineStateTab[] = [
  { id: 'all', label: 'All', emptyText: 'You have no Redpanda Connect pipelines' },
  {
    id: 'running',
    label: 'Running',
    states: [Pipeline_State.RUNNING, Pipeline_State.STARTING],
    emptyText: 'No running pipelines',
  },
  {
    id: 'stopped',
    label: 'Stopped',
    states: [Pipeline_State.STOPPED, Pipeline_State.STOPPING, Pipeline_State.COMPLETED],
    emptyText: 'No stopped pipelines',
  },
  {
    id: 'error',
    label: 'Error',
    states: [Pipeline_State.ERROR],
    emptyText: 'No pipelines with errors',
  },
];

// Inverted once, so counting is one pass over the rows rather than one scan per tab.
const TAB_BY_STATE = new Map<Pipeline_State, PipelineStateTabId>(
  PIPELINE_STATE_TABS.flatMap((tab) => (tab.states ?? []).map((state) => [state, tab.id] as const))
);

export function countPipelinesPerTab(states: Pipeline_State[]): Record<PipelineStateTabId, number> {
  const counts: Record<PipelineStateTabId, number> = { all: states.length, running: 0, stopped: 0, error: 0 };
  for (const state of states) {
    const tabId = TAB_BY_STATE.get(state);
    if (tabId) {
      counts[tabId] += 1;
    }
  }
  return counts;
}

/**
 * What to show when no rows are visible. Null for an unfiltered All view that has pipelines — that is
 * a stale page index about to be clamped, and it must not flash an empty message.
 */
export function pipelineListEmptyText({
  hasActiveFilters,
  activeTab,
  totalPipelines,
}: {
  hasActiveFilters: boolean;
  activeTab: PipelineStateTabId;
  totalPipelines: number;
}): string | null {
  if (hasActiveFilters) {
    return 'No pipelines match the current filters';
  }
  if (activeTab === 'all' && totalPipelines > 0) {
    return null;
  }
  return PIPELINE_STATE_TABS.find((t) => t.id === activeTab)?.emptyText ?? null;
}

/** Case-insensitive substring match over a pipeline's display name and id. */
export function matchesNameOrId(search: string, name: string, id: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return name.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
}
