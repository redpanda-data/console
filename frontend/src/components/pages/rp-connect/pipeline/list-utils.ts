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

export type PipelineStateTabId = 'all' | 'draft' | 'running' | 'stopped' | 'error';

/**
 * Sentinel the status column reports for a local draft. Drafts have no server-side pipeline and so
 * no `Pipeline_State`, but they share the column so one filter drives every tab.
 */
export const DRAFT_STATE_FILTER_VALUE = 'draft' as const;

/** Status column value for a row: a draft's sentinel, or the pipeline's state as a string. */
export type PipelineStateFilterValue = Pipeline_State | typeof DRAFT_STATE_FILTER_VALUE;

export type PipelineStateTab = {
  id: PipelineStateTabId;
  label: string;
  /** States the tab shows; undefined (with `includesDrafts` unset) means no state filtering. */
  states?: Pipeline_State[];
  /** Tab shows local drafts, which have no server state of their own. */
  includesDrafts?: boolean;
  emptyText: string;
};

// Transitional states ride with their destination: starting counts as running, stopping as stopped.
export const PIPELINE_STATE_TABS: PipelineStateTab[] = [
  { id: 'all', label: 'All', emptyText: 'You have no Redpanda Connect pipelines' },
  {
    id: 'draft',
    label: 'Drafts',
    includesDrafts: true,
    emptyText: 'No drafts saved in this browser',
  },
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

/** Status-column filter values for a tab, or undefined for the unfiltered All view. */
export function stateFilterValues(tab: PipelineStateTab): string[] | undefined {
  const values = [...(tab.states ?? []).map(String), ...(tab.includesDrafts ? [DRAFT_STATE_FILTER_VALUE] : [])];
  return values.length > 0 ? values : undefined;
}

// Inverted once, so counting is one pass over the rows rather than one scan per tab.
const TAB_BY_STATE = new Map<PipelineStateFilterValue, PipelineStateTabId>(
  PIPELINE_STATE_TABS.flatMap((tab) => {
    const drafts: PipelineStateFilterValue[] = tab.includesDrafts ? [DRAFT_STATE_FILTER_VALUE] : [];
    const values: PipelineStateFilterValue[] = [...(tab.states ?? []), ...drafts];
    return values.map((value) => [value, tab.id] as const);
  })
);

export function countPipelinesPerTab(states: PipelineStateFilterValue[]): Record<PipelineStateTabId, number> {
  const counts: Record<PipelineStateTabId, number> = {
    all: states.length,
    draft: 0,
    running: 0,
    stopped: 0,
    error: 0,
  };
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
