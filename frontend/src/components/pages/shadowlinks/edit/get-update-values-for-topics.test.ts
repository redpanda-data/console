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

import { FilterType, PatternType, ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { getUpdateValuesForTopics } from './shadowlink-edit-utils';
import type { FormValues } from '../create/model';
import { TLS_MODE } from '../create/model';

// Base form values for testing
const baseFormValues: FormValues = {
  name: 'test-shadow-link',
  bootstrapServers: [{ value: 'localhost:9092' }],
  advanceClientOptions: {
    metadataMaxAgeMs: 10_000,
    connectionTimeoutMs: 1000,
    retryBackoffMs: 100,
    fetchWaitMaxMs: 500,
    fetchMinBytes: 5_242_880,
    fetchMaxBytes: 20_971_520,
    fetchPartitionMaxBytes: 1_048_576,
  },
  useScram: true,
  scramCredentials: {
    username: 'admin',
    password: 'password123',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  useTls: true,
  useMtls: false,
  mtlsMode: TLS_MODE.PEM,
  mtls: {
    ca: undefined,
    clientCert: undefined,
    clientKey: undefined,
  },
  topicsMode: 'all',
  topics: [],
  topicProperties: [],
  enableConsumerOffsetSync: false,
  consumersMode: 'all',
  consumers: [],
  aclsMode: 'all',
  aclFilters: [],
};

describe('getUpdateValuesForTopics', () => {
  describe('Topics mode changes', () => {
    test('should detect change from all to specify mode', () => {
      const original = { ...baseFormValues, topicsMode: 'all' as const };
      const updated = { ...baseFormValues, topicsMode: 'specify' as const };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
    });

    test('should detect change from specify to all mode', () => {
      const original = { ...baseFormValues, topicsMode: 'specify' as const };
      const updated = { ...baseFormValues, topicsMode: 'all' as const };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
    });
  });

  describe('Topics array changes', () => {
    test('should detect when a topic is added to the list', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'topic2',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(2);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[1].name).toBe('topic2');
    });

    test('should detect when a topic is removed from the list', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'topic2',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a topic name is changed', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1-renamed',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1-renamed');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a topic pattern type is changed', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.PREFIX);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a topic filter type is changed', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.EXCLUDE);
    });
  });

  describe('Topic properties changes', () => {
    test('should detect when topic properties are added', () => {
      const original = {
        ...baseFormValues,
        topicProperties: [],
      };
      const updated = {
        ...baseFormValues,
        topicProperties: ['cleanup.policy', 'retention.ms'],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
    });

    test('should detect when topic properties are removed', () => {
      const original = {
        ...baseFormValues,
        topicProperties: ['cleanup.policy', 'retention.ms'],
      };
      const updated = {
        ...baseFormValues,
        topicProperties: [],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
    });

    test('should detect when topic properties are modified', () => {
      const original = {
        ...baseFormValues,
        topicProperties: ['cleanup.policy', 'retention.ms'],
      };
      const updated = {
        ...baseFormValues,
        topicProperties: ['cleanup.policy', 'compression.type'],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
    });

    test('should NOT detect change when only property order changed (order-independent)', () => {
      const original = {
        ...baseFormValues,
        topicProperties: ['cleanup.policy', 'retention.ms', 'compression.type'],
      };
      const updated = {
        ...baseFormValues,
        topicProperties: ['retention.ms', 'compression.type', 'cleanup.policy'],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).not.toContain('configurations.topic_metadata_sync_options');
      expect(result.fieldMaskPaths).toEqual([]);
    });
  });

  describe('Multiple changes', () => {
    test('should detect multiple changes at once (mode + topics + properties)', () => {
      const original = {
        ...baseFormValues,
        topicsMode: 'all' as const,
        topics: [],
        topicProperties: [],
      };
      const updated = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'topic2',
            patterType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
        topicProperties: ['cleanup.policy', 'retention.ms'],
      };

      const result = getUpdateValuesForTopics(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.topic_metadata_sync_options');
      expect(result.fieldMaskPaths).toHaveLength(1);

      // Validate schema values
      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(2);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.autoCreateShadowTopicFilters[1].name).toBe('topic2');
      expect(result.value.autoCreateShadowTopicFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.autoCreateShadowTopicFilters[1].filterType).toBe(FilterType.EXCLUDE);
      expect(result.value.syncedShadowTopicProperties).toEqual(['cleanup.policy', 'retention.ms']);
    });
  });

  describe('Schema building', () => {
    test('should build correct schema for all mode (with wildcard filter)', () => {
      const values = {
        ...baseFormValues,
        topicsMode: 'all' as const,
        topics: [],
        topicProperties: ['cleanup.policy'],
      };

      const result = getUpdateValuesForTopics(values, baseFormValues);

      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('*');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.syncedShadowTopicProperties).toEqual(['cleanup.policy']);
    });

    test('should build correct schema for specify mode with multiple topics', () => {
      const values = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'topic.*',
            patterType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
        topicProperties: [],
      };

      const result = getUpdateValuesForTopics(values, baseFormValues);

      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(2);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.autoCreateShadowTopicFilters[1].name).toBe('topic.*');
      expect(result.value.autoCreateShadowTopicFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.autoCreateShadowTopicFilters[1].filterType).toBe(FilterType.EXCLUDE);
      expect(result.value.syncedShadowTopicProperties).toEqual([]);
    });

    test('should build correct schema with topic properties', () => {
      const values = {
        ...baseFormValues,
        topicsMode: 'all' as const,
        topics: [],
        topicProperties: ['cleanup.policy', 'retention.ms', 'compression.type'],
      };

      const result = getUpdateValuesForTopics(values, baseFormValues);

      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('*');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.syncedShadowTopicProperties).toEqual(['cleanup.policy', 'retention.ms', 'compression.type']);
    });

    test('should build correct schema with empty topic properties', () => {
      const values = {
        ...baseFormValues,
        topicsMode: 'specify' as const,
        topics: [
          {
            name: 'topic1',
            patterType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
        topicProperties: [],
      };

      const result = getUpdateValuesForTopics(values, baseFormValues);

      expect(result.value.autoCreateShadowTopicFilters).toHaveLength(1);
      expect(result.value.autoCreateShadowTopicFilters[0].name).toBe('topic1');
      expect(result.value.autoCreateShadowTopicFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.autoCreateShadowTopicFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.syncedShadowTopicProperties).toEqual([]);
    });
  });
});
