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

// A single key metadata line shown on an expanded pipeline node card.
export type NodeMetaEntry = { label: string; value: string };

const MAX_META = 3;
const MAX_VALUE_LEN = 52;

function truncate(value: string, max = MAX_VALUE_LEN): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

// The fields most worth surfacing per component, in priority order. Anything not
// listed falls back to the first couple of scalar fields on the config.
const PREFERRED_FIELDS: Record<string, string[]> = {
  log: ['level', 'message'],
  mapping: ['mapping'],
  bloblang: ['mapping'],
  http_client: ['url', 'verb'],
  http_server: ['path'],
  kafka: ['topic', 'topics', 'consumer_group'],
  kafka_franz: ['topic', 'topics', 'consumer_group'],
  redpanda: ['topic', 'topics', 'consumer_group'],
  redpanda_common: ['topic', 'topics'],
  redpanda_migrator: ['topic', 'topics'],
  generate: ['interval', 'count'],
  file: ['paths', 'path'],
  switch: ['cases'],
  branch: ['request_map', 'result_map'],
  sql_select: ['table', 'driver'],
  sql_insert: ['table', 'driver'],
  cache: ['resource', 'operator'],
};

function pushField(meta: NodeMetaEntry[], config: Record<string, unknown>, key: string, label?: string): void {
  const value = config[key];
  if (value === undefined || value === null) {
    return;
  }
  if (isScalar(value)) {
    meta.push({ label: label ?? key, value: truncate(String(value)) });
  } else if (Array.isArray(value) && value.every((item) => isScalar(item))) {
    meta.push({ label: label ?? key, value: truncate(value.join(', ')) });
  } else if (Array.isArray(value)) {
    meta.push({ label: label ?? key, value: `${value.length} item${value.length === 1 ? '' : 's'}` });
  }
}

/**
 * Derive up to a few of the most relevant config values for a component, for
 * display on its node card. Deterministic: same config always yields the same
 * lines. `config` is the component's inner config (the value under its name key);
 * for components like `mapping`/`bloblang` it can be a bare string.
 */
// The first couple of scalar fields, used when no preferred field matched.
function fallbackScalarFields(record: Record<string, unknown>): NodeMetaEntry[] {
  const meta: NodeMetaEntry[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key !== 'label' && isScalar(value)) {
      pushField(meta, record, key);
    }
    if (meta.length >= 2) {
      break;
    }
  }
  return meta;
}

export function summarizeComponent(componentName: string, config: unknown): NodeMetaEntry[] {
  // Some processors (mapping/bloblang) are configured with a bare string.
  if (typeof config === 'string') {
    return config.trim() ? [{ label: 'expr', value: truncate(config.split('\n')[0]) }] : [];
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return [];
  }
  const record = config as Record<string, unknown>;

  const meta: NodeMetaEntry[] = [];
  for (const key of PREFERRED_FIELDS[componentName] ?? []) {
    if (meta.length >= MAX_META) {
      break;
    }
    pushField(meta, record, key);
  }

  const result = meta.length === 0 ? fallbackScalarFields(record) : meta;
  return result.slice(0, MAX_META);
}
