/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { z } from 'zod';

import type { FilterEntry } from '../state/ui';

const storedFiltersSchema = z.record(
  z.string(),
  z.array(
    z.object({
      isNew: z.boolean(),
      id: z.string(),
      filterType: z.literal('code'),
      isActive: z.boolean(),
      name: z.string(),
      transpiledCode: z.string(),
      code: z.string(),
    })
  )
);

const SESSION_STORAGE_KEY = 'topic-filters';

type TopicFiltersMap = {
  [topicName: string]: FilterEntry[];
};

/**
 * Get all filters from sessionStorage
 */
function getAllFilters(): TopicFiltersMap {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!(stored !== null && stored !== undefined && stored !== '')) {
      return {};
    }
    return storedFiltersSchema.parse(JSON.parse(stored));
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage for debugging
    console.warn('Failed to parse filters from sessionStorage:', error);
    return {};
  }
}

/**
 * Save all filters to sessionStorage
 */
function saveAllFilters(filters: TopicFiltersMap): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage for debugging
    console.warn('Failed to save filters to sessionStorage:', error);
  }
}

/**
 * Get filters for a specific topic
 */
export function getTopicFilters(topicName: string): FilterEntry[] {
  const allFilters = getAllFilters();
  return allFilters[topicName] ?? [];
}

/**
 * Set filters for a specific topic
 */
export function setTopicFilters(topicName: string, filters: FilterEntry[]): void {
  const allFilters = getAllFilters();
  allFilters[topicName] = filters;
  saveAllFilters(allFilters);
}

/**
 * Clear filters for a specific topic
 */
export function clearTopicFilters(topicName: string): void {
  const allFilters = getAllFilters();
  delete allFilters[topicName];
  saveAllFilters(allFilters);
}

/**
 * Clear all filters from sessionStorage
 */
export function clearAllTopicFilters(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
