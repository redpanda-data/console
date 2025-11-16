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

import { describe, expect, it } from 'vitest';

import {
  getDefaultProperties,
  getPropertiesByCategory,
  isPropertyAlwaysReplicated,
  isPropertyDisabled,
  isPropertyEditable,
} from './topic-properties-config';

describe('topic-properties-config', () => {
  describe('getPropertiesByCategory', () => {
    it('should return a Map with correct number of categories', () => {
      const result = getPropertiesByCategory();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should group Retention properties correctly', () => {
      const result = getPropertiesByCategory();
      const retentionProps = result.get('Retention');

      expect(retentionProps).toBeDefined();
      expect(retentionProps).toHaveLength(3);
      expect(retentionProps?.map((p) => p.name)).toEqual(
        expect.arrayContaining(['retention.bytes', 'retention.ms', 'delete.retention.ms'])
      );
    });

    it('should group Compaction properties correctly', () => {
      const result = getPropertiesByCategory();
      const compactionProps = result.get('Compaction');

      expect(compactionProps).toBeDefined();
      expect(compactionProps!.length).toBeGreaterThan(0);
      expect(compactionProps?.map((p) => p.name)).toEqual(
        expect.arrayContaining(['cleanup.policy', 'min.compaction.lag.ms', 'max.compaction.lag.ms'])
      );
    });

    it('should return undefined for non-existent categories', () => {
      const result = getPropertiesByCategory();
      const nonExistent = result.get('NonExistentCategory');

      expect(nonExistent).toBeUndefined();
    });
  });

  describe('getDefaultProperties', () => {
    it('should return 7 default properties', () => {
      const result = getDefaultProperties();

      expect(result).toHaveLength(7);
    });

    it('should include expected default properties', () => {
      const result = getDefaultProperties();

      expect(result).toEqual(
        expect.arrayContaining([
          'retention.bytes',
          'retention.ms',
          'delete.retention.ms',
          'compression.type',
          'replication.factor',
          'min.compaction.lag.ms',
          'max.compaction.lag.ms',
        ])
      );
    });

    it('should only return property names as strings', () => {
      const result = getDefaultProperties();

      for (const prop of result) {
        expect(typeof prop).toBe('string');
      }
    });
  });

  describe('isPropertyEditable', () => {
    it('should return true for optional properties', () => {
      expect(isPropertyEditable('min.cleanable.dirty.ratio')).toBe(true);
      expect(isPropertyEditable('write.caching')).toBe(true);
    });

    it('should return false for always properties', () => {
      expect(isPropertyEditable('cleanup.policy')).toBe(false);
      expect(isPropertyEditable('max.message.bytes')).toBe(false);
    });

    it('should return false for never properties', () => {
      expect(isPropertyEditable('redpanda.remote.recovery')).toBe(false);
      expect(isPropertyEditable('redpanda.virtual.cluster.id')).toBe(false);
    });

    it('should return false for non-existent properties', () => {
      expect(isPropertyEditable('non.existent.property')).toBe(false);
    });
  });

  describe('isPropertyDisabled', () => {
    it('should return true for never properties', () => {
      expect(isPropertyDisabled('redpanda.remote.recovery')).toBe(true);
      expect(isPropertyDisabled('redpanda.remote.readreplica')).toBe(true);
      expect(isPropertyDisabled('redpanda.virtual.cluster.id')).toBe(true);
    });

    it('should return false for optional properties', () => {
      expect(isPropertyDisabled('min.cleanable.dirty.ratio')).toBe(false);
      expect(isPropertyDisabled('retention.bytes')).toBe(false);
    });

    it('should return false for always properties', () => {
      expect(isPropertyDisabled('cleanup.policy')).toBe(false);
      expect(isPropertyDisabled('max.message.bytes')).toBe(false);
    });

    it('should return false for non-existent properties', () => {
      expect(isPropertyDisabled('non.existent.property')).toBe(false);
    });
  });

  describe('isPropertyAlwaysReplicated', () => {
    it('should return true for always properties', () => {
      expect(isPropertyAlwaysReplicated('cleanup.policy')).toBe(true);
      expect(isPropertyAlwaysReplicated('max.message.bytes')).toBe(true);
      expect(isPropertyAlwaysReplicated('message.timestamp.type')).toBe(true);
    });

    it('should return false for optional properties', () => {
      expect(isPropertyAlwaysReplicated('min.cleanable.dirty.ratio')).toBe(false);
      expect(isPropertyAlwaysReplicated('retention.bytes')).toBe(false);
    });

    it('should return false for never properties', () => {
      expect(isPropertyAlwaysReplicated('redpanda.remote.recovery')).toBe(false);
      expect(isPropertyAlwaysReplicated('redpanda.virtual.cluster.id')).toBe(false);
    });

    it('should return false for non-existent properties', () => {
      expect(isPropertyAlwaysReplicated('non.existent.property')).toBe(false);
    });
  });
});
