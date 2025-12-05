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

import { getUpdateValuesForConsumerGroups } from './shadowlink-edit-utils';
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

describe('getUpdateValuesForConsumerGroups', () => {
  describe('Consumer mode changes', () => {
    test('should detect change from all to specify mode', () => {
      const original = { ...baseFormValues, consumersMode: 'all' as const, consumers: [] };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect change from specify to all mode', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = { ...baseFormValues, consumersMode: 'all' as const, consumers: [] };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('*');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });
  });

  describe('Consumer array changes', () => {
    test('should detect when a consumer is added to the list', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'consumer-group-2',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(2);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[1].name).toBe('consumer-group-2');
    });

    test('should detect when a consumer is removed from the list', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'consumer-group-2',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
    });

    test('should detect when a consumer name is changed', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1-renamed',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1-renamed');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a consumer pattern type is changed', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.PREFIX);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a consumer filter type is changed', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.EXCLUDE);
    });
  });

  describe('Multiple changes', () => {
    test('should detect multiple changes at once (mode + consumers)', () => {
      const original = {
        ...baseFormValues,
        consumersMode: 'all' as const,
        consumers: [],
      };
      const updated = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'consumer-group-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.consumer_offset_sync_options');
      expect(result.fieldMaskPaths).toHaveLength(1);

      // Validate schema values
      expect(result.value.groupFilters).toHaveLength(2);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.groupFilters[1].name).toBe('consumer-group-2');
      expect(result.value.groupFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.groupFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });
  });

  describe('Schema building', () => {
    test('should build correct schema for all mode (wildcard filter with name=*)', () => {
      const values = {
        ...baseFormValues,
        consumersMode: 'all' as const,
        consumers: [],
      };

      const result = getUpdateValuesForConsumerGroups(values, baseFormValues);

      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('*');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should build correct schema for specify mode with single consumer', () => {
      const values = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'my-consumer-group',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(values, baseFormValues);

      expect(result.value.groupFilters).toHaveLength(1);
      expect(result.value.groupFilters[0].name).toBe('my-consumer-group');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should build correct schema for specify mode with multiple consumers', () => {
      const values = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'consumer-group-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'consumer-group-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(values, baseFormValues);

      expect(result.value.groupFilters).toHaveLength(2);
      expect(result.value.groupFilters[0].name).toBe('consumer-group-1');
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.groupFilters[1].name).toBe('consumer-group-2');
      expect(result.value.groupFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.groupFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });

    test('should build correct schema with different pattern types (LITERAL, PREFIX)', () => {
      const values = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'exact-match',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'prefix-',
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(values, baseFormValues);

      expect(result.value.groupFilters).toHaveLength(2);
      expect(result.value.groupFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.groupFilters[1].patternType).toBe(PatternType.PREFIX);
    });

    test('should build correct schema with different filter types (INCLUDE, EXCLUDE)', () => {
      const values = {
        ...baseFormValues,
        consumersMode: 'specify' as const,
        consumers: [
          {
            name: 'included-group',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'excluded-group',
            patternType: PatternType.LITERAL,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForConsumerGroups(values, baseFormValues);

      expect(result.value.groupFilters).toHaveLength(2);
      expect(result.value.groupFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.groupFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });
  });
});
