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

import { parseConfigComponents } from '../utils/yaml';

const configComponentsCache = new Map<string, ReturnType<typeof parseConfigComponents>>();
const CONFIG_COMPONENTS_CACHE_LIMIT = 10_000;

/**
 * Cached {@link parseConfigComponents}, keyed by the config text: a full YAML parse, and the list's
 * row transform re-runs over every row on each drain step and poll tick.
 *
 * The Map is never cleared, so the steady-state cost is the retained YAML of up to 10k pipelines —
 * the keys, not the parsed values. Past that ceiling the oldest half is evicted and re-parses on the
 * next poll, so a cluster steadily above 10k pays the parse this avoids.
 */
export function parseConfigComponentsCached(configYaml: string): ReturnType<typeof parseConfigComponents> {
  const cached = configComponentsCache.get(configYaml);
  if (cached) {
    return cached;
  }
  if (configComponentsCache.size >= CONFIG_COMPONENTS_CACHE_LIMIT) {
    // Oldest half (Map preserves insertion order) — clearing all would reparse everything next refresh.
    let surplus = CONFIG_COMPONENTS_CACHE_LIMIT / 2;
    for (const key of configComponentsCache.keys()) {
      configComponentsCache.delete(key);
      surplus -= 1;
      if (surplus <= 0) {
        break;
      }
    }
  }
  const parsed = parseConfigComponents(configYaml);
  configComponentsCache.set(configYaml, parsed);
  return parsed;
}
