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

import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { describe, expect, test } from 'vitest';

import {
  getFilterTypeLabel,
  getOperationLabel,
  getPatternTypeLabel,
  getPermissionTypeLabel,
  getResourceTypeLabel,
} from './shadowlink-helpers';

describe('shadowlink-helpers', () => {
  describe('getFilterTypeLabel', () => {
    test.each([
      { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE, expected: 'Include specific topics' },
      { patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE, expected: 'Include starting with' },
      { patternType: PatternType.LITERAL, filterType: FilterType.EXCLUDE, expected: 'Exclude specific' },
      { patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE, expected: 'Exclude starting with' },
      { patternType: PatternType.UNSPECIFIED, filterType: FilterType.UNSPECIFIED, expected: 'Include specific topics' },
    ])(
      'should return $expected for pattern=$patternType, filter=$filterType',
      ({ patternType, filterType, expected }) => {
        expect(getFilterTypeLabel(patternType, filterType)).toBe(expected);
      }
    );
  });

  describe('getResourceTypeLabel', () => {
    test.each([
      { input: undefined, expected: 'Any' },
      { input: ACLResource.ACL_RESOURCE_ANY, expected: 'Any' },
      { input: ACLResource.ACL_RESOURCE_TOPIC, expected: 'Topic' },
      { input: ACLResource.ACL_RESOURCE_GROUP, expected: 'Consumer Group' },
      { input: ACLResource.ACL_RESOURCE_CLUSTER, expected: 'Cluster' },
      { input: ACLResource.ACL_RESOURCE_TXN_ID, expected: 'Transaction ID' },
      { input: ACLResource.ACL_RESOURCE_SR_SUBJECT, expected: 'Schema Registry Subject' },
      { input: ACLResource.ACL_RESOURCE_SR_REGISTRY, expected: 'Schema Registry' },
    ])('should return $expected for $input', ({ input, expected }) => {
      expect(getResourceTypeLabel(input)).toBe(expected);
    });
  });

  describe('getPatternTypeLabel', () => {
    test.each([
      { input: undefined, expected: 'Any' },
      { input: ACLPattern.ACL_PATTERN_ANY, expected: 'Any' },
      { input: ACLPattern.ACL_PATTERN_LITERAL, expected: 'Literal' },
      { input: ACLPattern.ACL_PATTERN_PREFIXED, expected: 'Prefixed' },
      { input: ACLPattern.ACL_PATTERN_MATCH, expected: 'Match' },
    ])('should return $expected for $input', ({ input, expected }) => {
      expect(getPatternTypeLabel(input)).toBe(expected);
    });
  });

  describe('getOperationLabel', () => {
    test.each([
      { input: undefined, expected: 'Any' },
      { input: ACLOperation.ACL_OPERATION_ANY, expected: 'Any' },
      { input: ACLOperation.ACL_OPERATION_READ, expected: 'Read' },
      { input: ACLOperation.ACL_OPERATION_WRITE, expected: 'Write' },
      { input: ACLOperation.ACL_OPERATION_CREATE, expected: 'Create' },
      { input: ACLOperation.ACL_OPERATION_REMOVE, expected: 'Remove' },
      { input: ACLOperation.ACL_OPERATION_ALTER, expected: 'Alter' },
      { input: ACLOperation.ACL_OPERATION_DESCRIBE, expected: 'Describe' },
      { input: ACLOperation.ACL_OPERATION_CLUSTER_ACTION, expected: 'Cluster Action' },
      { input: ACLOperation.ACL_OPERATION_DESCRIBE_CONFIGS, expected: 'Describe Configs' },
      { input: ACLOperation.ACL_OPERATION_ALTER_CONFIGS, expected: 'Alter Configs' },
      { input: ACLOperation.ACL_OPERATION_IDEMPOTENT_WRITE, expected: 'Idempotent Write' },
    ])('should return $expected for $input', ({ input, expected }) => {
      expect(getOperationLabel(input)).toBe(expected);
    });
  });

  describe('getPermissionTypeLabel', () => {
    test.each([
      { input: undefined, expected: 'Any' },
      { input: ACLPermissionType.ACL_PERMISSION_TYPE_ANY, expected: 'Any' },
      { input: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW, expected: 'Allow' },
      { input: ACLPermissionType.ACL_PERMISSION_TYPE_DENY, expected: 'Deny' },
    ])('should return $expected for $input', ({ input, expected }) => {
      expect(getPermissionTypeLabel(input)).toBe(expected);
    });
  });
});
