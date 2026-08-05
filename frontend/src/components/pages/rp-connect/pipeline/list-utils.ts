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

/**
 * Collapses repeated connector names into one counted entry, in first-appearance order:
 * ["redpanda", "redpanda", "s3"] → [{ name: "redpanda", count: 2 }, { name: "s3", count: 1 }].
 */
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

// Transitional states ride with their destination: starting counts as running, stopping as
// stopped.
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

export function countPipelinesPerTab(states: Pipeline_State[]): Record<PipelineStateTabId, number> {
  const counts: Record<PipelineStateTabId, number> = { all: states.length, running: 0, stopped: 0, error: 0 };
  for (const tab of PIPELINE_STATE_TABS) {
    if (tab.states) {
      counts[tab.id] = states.filter((s) => tab.states?.includes(s)).length;
    }
  }
  return counts;
}

/** Case-insensitive substring match over a pipeline's display name and id. */
export function matchesNameOrId(search: string, name: string, id: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return name.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
}
