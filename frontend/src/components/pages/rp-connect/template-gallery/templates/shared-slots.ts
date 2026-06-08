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

// biome-ignore lint/suspicious/noTemplateCurlyInString: ${secrets.X} is Cloud secret syntax shown in copy, not a JS template string.

import type { SecretSlot, StringSlot, TopicSlot } from '../pipeline-template-types';

// Postgres replication slot names allow only [a-z0-9_] and max 63 chars. Derive
// a deterministic one from the pipeline name so a blank field still produces a
// valid, stable slot the connector (and lint) accept.
export const toReplicationSlotName = (pipelineName: string): string => {
  const sanitized = pipelineName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `rpcn_${sanitized || 'pipeline'}`.slice(0, 63);
};

export const dsnSlot = (
  id: string,
  dbName: string,
  suggested: string,
  schemaField?: string,
  section: 'source' | 'sink' = 'source'
): SecretSlot => ({
  id,
  section,
  kind: 'secret',
  label: `${dbName} connection DSN`,
  description: `Stored as a Cloud secret. Referenced in YAML as \${secrets.${suggested}}.`,
  suggestedName: suggested,
  required: true,
  schemaField,
});

export const targetTopicSlot: TopicSlot = {
  id: 'targetTopic',
  section: 'sink',
  kind: 'topic',
  label: 'Target Redpanda topic',
  description: 'Records will be written to this topic.',
  required: true,
  schemaField: 'topic',
};

export const sourceTopicSlot: TopicSlot = {
  id: 'sourceTopic',
  section: 'source',
  kind: 'topic',
  label: 'Source Redpanda topic',
  description: 'Records will be read from this topic.',
  required: true,
  schemaField: 'topics',
};

export const consumerGroupSlot: StringSlot = {
  id: 'consumerGroup',
  section: 'options',
  kind: 'string',
  label: 'Consumer group',
  description: 'Identifier used to track read offsets for the source topic.',
  placeholder: 'redpanda-template-consumer',
  required: true,
  schemaField: 'consumer_group',
};
