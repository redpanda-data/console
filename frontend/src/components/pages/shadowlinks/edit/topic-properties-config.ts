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

/**
 * Shadowing status for topic properties in shadow link replication
 */
export type ShadowingStatus = 'always' | 'optional' | 'default' | 'never';

/**
 * Topic property configuration
 */
export type TopicPropertyConfig = {
  name: string;
  status: ShadowingStatus[];
  category: string;
};

/**
 * Complete list of all topic properties with their shadowing status and categories
 */
export const TOPIC_PROPERTIES: TopicPropertyConfig[] = [
  // Retention
  { name: 'retention.bytes', status: ['optional', 'default'], category: 'Retention' },
  { name: 'retention.ms', status: ['optional', 'default'], category: 'Retention' },
  { name: 'delete.retention.ms', status: ['optional', 'default'], category: 'Retention' },

  // Compaction
  { name: 'cleanup.policy', status: ['always'], category: 'Compaction' },
  { name: 'compaction.strategy', status: ['optional'], category: 'Compaction' },
  { name: 'min.cleanable.dirty.ratio', status: ['optional'], category: 'Compaction' },
  { name: 'min.compaction.lag.ms', status: ['optional', 'default'], category: 'Compaction' },
  { name: 'max.compaction.lag.ms', status: ['optional', 'default'], category: 'Compaction' },

  // Replication
  { name: 'replication.factor', status: ['optional', 'default'], category: 'Replication' },
  { name: 'min.insync.replicas', status: ['optional'], category: 'Replication' },
  { name: 'unclear.leader.election.enable', status: ['optional'], category: 'Replication' },
  { name: 'leader.replication.throttled.replicas', status: ['optional'], category: 'Replication' },
  { name: 'follower.replication.throttled.replicas', status: ['optional'], category: 'Replication' },

  // Tiered Storage
  { name: 'redpanda.remote.write', status: ['optional'], category: 'Tiered Storage' },
  { name: 'redpanda.remote.read', status: ['optional'], category: 'Tiered Storage' },
  { name: 'redpanda.remote.delete', status: ['optional'], category: 'Tiered Storage' },
  { name: 'redpanda.remote.recovery', status: ['never'], category: 'Tiered Storage' },
  { name: 'redpanda.remote.readreplica', status: ['never'], category: 'Tiered Storage' },
  { name: 'redpanda.remote.allowgaps', status: ['never'], category: 'Tiered Storage' },

  // Write Caching
  { name: 'write.caching', status: ['optional'], category: 'Write Caching' },
  { name: 'flush.ms', status: ['optional'], category: 'Write Caching' },
  { name: 'flush.bytes', status: ['optional'], category: 'Write Caching' },
  { name: 'flush.messages', status: ['optional'], category: 'Write Caching' },

  // Compression
  { name: 'compression.type', status: ['optional', 'default'], category: 'Compression' },

  // Segments
  { name: 'segment.bytes', status: ['optional'], category: 'Segments' },
  { name: 'segment.ms', status: ['optional'], category: 'Segments' },
  { name: 'segment.index.bytes', status: ['optional'], category: 'Segments' },
  { name: 'segment.jitter.ms', status: ['optional'], category: 'Segments' },

  // Messages
  { name: 'max.message.bytes', status: ['always'], category: 'Messages' },
  { name: 'message.timestamp.type', status: ['always'], category: 'Messages' },
  { name: 'message.timestamp.difference.max.ms', status: ['optional'], category: 'Messages' },
  { name: 'message.timestamp.before.max.ms', status: ['optional'], category: 'Messages' },
  { name: 'message.timestamp.after.max.ms', status: ['optional'], category: 'Messages' },
  { name: 'message.downconversion.enable', status: ['optional'], category: 'Messages' },
  { name: 'message.format.version', status: ['optional'], category: 'Messages' },

  // Schema Validation
  { name: 'redpanda.key.schema.id.validation', status: ['optional'], category: 'Schema Validation' },
  { name: 'redpanda.key.subject.name.strategy', status: ['optional'], category: 'Schema Validation' },
  { name: 'redpanda.value.schema.id.validation', status: ['optional'], category: 'Schema Validation' },
  { name: 'redpanda.value.subject.name.strategy', status: ['optional'], category: 'Schema Validation' },
  { name: 'confluent.key.schema.validation', status: ['optional'], category: 'Schema Validation' },
  { name: 'confluent.key.subject.name.strategy', status: ['optional'], category: 'Schema Validation' },
  { name: 'confluent.value.schema.validation', status: ['optional'], category: 'Schema Validation' },
  { name: 'confluent.value.subject.name.strategy', status: ['optional'], category: 'Schema Validation' },

  // Iceberg
  { name: 'redpanda.iceberg.mode', status: ['optional'], category: 'Iceberg' },
  { name: 'redpanda.iceberg.delete', status: ['optional'], category: 'Iceberg' },
  { name: 'redpanda.iceberg.partition.spec', status: ['optional'], category: 'Iceberg' },
  { name: 'redpanda.iceberg.invalid.record.action', status: ['optional'], category: 'Iceberg' },
  { name: 'redpanda.iceberg.target.lag.ms', status: ['optional'], category: 'Iceberg' },

  // Other
  { name: 'partition count', status: ['always'], category: 'Other' },
  { name: 'redpanda.virtual.cluster.id', status: ['never'], category: 'Other' },
  { name: 'redpanda.leaders.preference', status: ['never'], category: 'Other' },
  { name: 'redpanda.cloud_topic.enabled', status: ['never'], category: 'Other' },
  { name: 'index.interval.bytes', status: ['optional'], category: 'Other' },
  { name: 'file.delete.delay.ms', status: ['optional'], category: 'Other' },
  { name: 'preallocation', status: ['optional'], category: 'Other' },
];

/**
 * Get properties grouped by category
 */
export const getPropertiesByCategory = (): Map<string, TopicPropertyConfig[]> => {
  const categoryMap = new Map<string, TopicPropertyConfig[]>();

  for (const property of TOPIC_PROPERTIES) {
    const existing = categoryMap.get(property.category) || [];
    existing.push(property);
    categoryMap.set(property.category, existing);
  }

  return categoryMap;
};

/**
 * Get default properties that should be pre-selected
 */
export const getDefaultProperties = (): string[] =>
  TOPIC_PROPERTIES.filter((p) => p.status.includes('default')).map((p) => p.name);

/**
 * Check if a property can be edited (not 'never' or 'always')
 */
export const isPropertyEditable = (propertyName: string): boolean => {
  const property = TOPIC_PROPERTIES.find((p) => p.name === propertyName);
  if (!property) {
    return false;
  }
  return !(property.status.includes('never') || property.status.includes('always'));
};

/**
 * Check if a property should be disabled (status includes 'never')
 */
export const isPropertyDisabled = (propertyName: string): boolean => {
  const property = TOPIC_PROPERTIES.find((p) => p.name === propertyName);
  return property?.status.includes('never') ?? false;
};

/**
 * Check if a property is always replicated (status includes 'always')
 */
export const isPropertyAlwaysReplicated = (propertyName: string): boolean => {
  const property = TOPIC_PROPERTIES.find((p) => p.name === propertyName);
  return property?.status.includes('always') ?? false;
};

/**
 * Category display order
 */
export const CATEGORY_ORDER = [
  'Retention',
  'Compaction',
  'Replication',
  'Tiered Storage',
  'Write Caching',
  'Compression',
  'Segments',
  'Messages',
  'Schema Validation',
  'Iceberg',
  'Other',
];
