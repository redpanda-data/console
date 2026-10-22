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

import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { z } from 'zod';

import { PIPELINE_STATE_TABS, type PipelineStateTabId, stateFilterValues } from './list-utils';

// The list's view as URL search params, so a view can be linked and survives a reload. Every key is
// optional and drops out when it holds its default; a value that doesn't parse is ignored.

const TAB_IDS = PIPELINE_STATE_TABS.map((tab) => tab.id) as [PipelineStateTabId, ...PipelineStateTabId[]];
const SORTABLE_COLUMNS = ['state', 'name', 'schedule'] as const;
const values = z.array(z.string()).optional().catch(undefined);

export const pipelineListSearchSchema = z.object({
  tab: z.enum(TAB_IDS).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  input: values,
  output: values,
  tag: values,
  runs: values,
  schedule: values,
  sort: z.enum(SORTABLE_COLUMNS).optional().catch(undefined),
  desc: z.boolean().optional().catch(undefined),
  /** 1-based. */
  page: z.number().int().positive().optional().catch(undefined),
});

export type PipelineListSearch = z.infer<typeof pipelineListSearchSchema>;

/** The search params' list keys, parsed; anything else in them is left out. */
export function readPipelineListSearch(search: unknown): PipelineListSearch {
  const parsed = pipelineListSearchSchema.safeParse(search ?? {});
  return parsed.success ? parsed.data : {};
}

// Facet columns and the search keys that hold them.
const FILTER_KEYS = {
  inputs: 'input',
  outputs: 'output',
  tags: 'tag',
  end: 'runs',
  schedule: 'schedule',
} as const satisfies Record<string, keyof PipelineListSearch>;

type FilterColumnId = keyof typeof FILTER_KEYS;

const isFilterColumn = (id: string): id is FilterColumnId => id in FILTER_KEYS;

/** The table's column filters for `search`: its tab, its name search, and each facet. */
export function columnFiltersFromSearch(search: PipelineListSearch): ColumnFiltersState {
  const filters: ColumnFiltersState = [];
  const tab = PIPELINE_STATE_TABS.find((t) => t.id === search.tab);
  const states = tab ? stateFilterValues(tab) : undefined;
  if (states) {
    filters.push({ id: 'state', value: states });
  }
  if (search.q?.trim()) {
    filters.push({ id: 'name', value: search.q });
  }
  for (const [columnId, key] of Object.entries(FILTER_KEYS)) {
    const selected = search[key];
    if (selected?.length) {
      filters.push({ id: columnId, value: selected });
    }
  }
  return filters;
}

/** The facet keys for a table's column filters; the tab and name search have keys of their own. */
export function facetSearchFromFilters(
  filters: ColumnFiltersState
): Pick<PipelineListSearch, (typeof FILTER_KEYS)[FilterColumnId]> {
  const next: Record<string, string[] | undefined> = Object.fromEntries(
    Object.values(FILTER_KEYS).map((key) => [key, undefined])
  );
  for (const filter of filters) {
    if (isFilterColumn(filter.id) && Array.isArray(filter.value) && filter.value.length > 0) {
      next[FILTER_KEYS[filter.id]] = filter.value as string[];
    }
  }
  return next;
}

// Status first, so error and transitioning pipelines land on page 1 of a large cluster.
const DEFAULT_SORT: SortingState = [{ id: 'state', desc: false }];

export function sortingFromSearch(search: PipelineListSearch): SortingState {
  return search.sort ? [{ id: search.sort, desc: search.desc ?? false }] : DEFAULT_SORT;
}

/** The sort keys for a table's sorting; the default sort leaves them out. */
export function sortSearchFromSorting(sorting: SortingState): Pick<PipelineListSearch, 'sort' | 'desc'> {
  const [first] = sorting;
  const sort = SORTABLE_COLUMNS.find((id) => id === first?.id);
  if (!sort || (sort === 'state' && !first.desc)) {
    return { sort: undefined, desc: undefined };
  }
  return { sort, desc: first.desc || undefined };
}

/** `search` with `patch` applied, and every key left at its default removed. */
export function nextPipelineListSearch(
  search: Record<string, unknown>,
  patch: Partial<Record<keyof PipelineListSearch, unknown>>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...search, ...patch };
  for (const [key, value] of Object.entries(next)) {
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty || (key === 'tab' && value === 'all') || (key === 'page' && value === 1)) {
      delete next[key];
    }
  }
  return next;
}
