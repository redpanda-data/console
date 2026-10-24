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

import { parse as parseYaml } from 'yaml';

import { type PipelineEndStatus, summarizePipelineEnd } from '../utils/input-end-behavior';
import { configComponentsOf, type ParsedConfigComponents, type ParsedYamlConfig } from '../utils/yaml';

/** What the list shows from a config: its component names, and whether it stops on its own. */
export type ConfigListFacts = ParsedConfigComponents & { end: PipelineEndStatus };

const NO_FACTS: ConfigListFacts = { inputs: [], processors: [], outputs: [], end: 'none' };

// One parse serves both, and each fails on its own.
function readConfigFacts(configYaml: string): ConfigListFacts {
  if (!configYaml) {
    return NO_FACTS;
  }
  let config: ParsedYamlConfig | null;
  try {
    config = parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null;
  } catch {
    return NO_FACTS;
  }
  let end: PipelineEndStatus = 'none';
  try {
    end = summarizePipelineEnd(config).status;
  } catch {
    // Left as `none`: nothing to judge.
  }
  try {
    return { ...configComponentsOf(config), end };
  } catch {
    return { ...NO_FACTS, end };
  }
}

const configComponentsCache = new Map<string, ConfigListFacts>();
const CONFIG_COMPONENTS_CACHE_LIMIT = 10_000;

/**
 * Cached {@link readConfigFacts}, keyed by the config text: a full YAML parse, and the list's
 * row transform re-runs over every row on each drain step and poll tick.
 *
 * The Map is never cleared, so the steady-state cost is the retained YAML of up to 10k pipelines —
 * the keys, not the parsed values. Past that ceiling the oldest half is evicted and re-parses on the
 * next poll, so a cluster steadily above 10k pays the parse this avoids.
 */
export function parseConfigComponentsCached(configYaml: string): ConfigListFacts {
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
  const parsed = readConfigFacts(configYaml);
  configComponentsCache.set(configYaml, parsed);
  return parsed;
}
