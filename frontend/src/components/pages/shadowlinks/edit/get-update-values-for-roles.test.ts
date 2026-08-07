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

import { FilterType, PatternType, ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { getUpdateValuesForRoles } from './shadowlink-edit-utils';
import type { FormValues } from '../create/model';
import { AUTH_METHOD, initialValues, TLS_MODE } from '../create/model';

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
  authMethod: AUTH_METHOD.SCRAM,
  scramCredentials: {
    username: 'admin',
    password: 'password123',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  plainCredentials: undefined,
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
  rolesMode: 'all',
  roles: [],
  aclsMode: 'all',
  aclFilters: [],
  enableSchemaRegistrySync: false,
  schemaRegistry: initialValues.schemaRegistry,
  excludeDefault: false,
};

describe('getUpdateValuesForRoles', () => {
  describe('Role mode changes', () => {
    test('should detect change from all to specify mode', () => {
      const original = { ...baseFormValues, rolesMode: 'all' as const, roles: [] };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect change from specify to all mode', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = { ...baseFormValues, rolesMode: 'all' as const, roles: [] };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('*');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });
  });

  describe('Role array changes', () => {
    test('should detect when a role is added to the list', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(2);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[1].name).toBe('role-2');
    });

    test('should detect when a role is removed from the list', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
    });

    test('should detect when a role name is changed', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1-renamed',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('role-1-renamed');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a role pattern type is changed', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.PREFIX);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should detect when a role filter type is changed', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.EXCLUDE);
    });
  });

  describe('No changes', () => {
    test('should not emit a mask path when mode and roles are unchanged', () => {
      const original = { ...baseFormValues, rolesMode: 'specify' as const, roles: [] };
      const updated = { ...baseFormValues, rolesMode: 'specify' as const, roles: [] };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toEqual([]);
    });
  });

  describe('Multiple changes', () => {
    test('should detect multiple changes at once (mode + roles)', () => {
      const original = {
        ...baseFormValues,
        rolesMode: 'all' as const,
        roles: [],
      };
      const updated = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.role_sync_options');
      expect(result.fieldMaskPaths).toHaveLength(1);

      // Validate schema values
      expect(result.value.roleNameFilters).toHaveLength(2);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.roleNameFilters[1].name).toBe('role-2');
      expect(result.value.roleNameFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.roleNameFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });
  });

  describe('Schema building', () => {
    test('should build correct schema for all mode (wildcard filter with name=*)', () => {
      const values = {
        ...baseFormValues,
        rolesMode: 'all' as const,
        roles: [],
      };

      const result = getUpdateValuesForRoles(values, baseFormValues);

      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('*');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should build correct schema for specify mode with single role', () => {
      const values = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'my-role',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(values, baseFormValues);

      expect(result.value.roleNameFilters).toHaveLength(1);
      expect(result.value.roleNameFilters[0].name).toBe('my-role');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
    });

    test('should build correct schema for specify mode with multiple roles', () => {
      const values = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(values, baseFormValues);

      expect(result.value.roleNameFilters).toHaveLength(2);
      expect(result.value.roleNameFilters[0].name).toBe('role-1');
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.roleNameFilters[1].name).toBe('role-2');
      expect(result.value.roleNameFilters[1].patternType).toBe(PatternType.PREFIX);
      expect(result.value.roleNameFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });

    test('should build correct schema with different pattern types (LITERAL, PREFIX)', () => {
      const values = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
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

      const result = getUpdateValuesForRoles(values, baseFormValues);

      expect(result.value.roleNameFilters).toHaveLength(2);
      expect(result.value.roleNameFilters[0].patternType).toBe(PatternType.LITERAL);
      expect(result.value.roleNameFilters[1].patternType).toBe(PatternType.PREFIX);
    });

    test('should build correct schema with different filter types (INCLUDE, EXCLUDE)', () => {
      const values = {
        ...baseFormValues,
        rolesMode: 'specify' as const,
        roles: [
          {
            name: 'included-role',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'excluded-role',
            patternType: PatternType.LITERAL,
            filterType: FilterType.EXCLUDE,
          },
        ],
      };

      const result = getUpdateValuesForRoles(values, baseFormValues);

      expect(result.value.roleNameFilters).toHaveLength(2);
      expect(result.value.roleNameFilters[0].filterType).toBe(FilterType.INCLUDE);
      expect(result.value.roleNameFilters[1].filterType).toBe(FilterType.EXCLUDE);
    });
  });
});
