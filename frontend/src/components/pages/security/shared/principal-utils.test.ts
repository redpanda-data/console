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

import { describe, expect, test } from 'vitest';

import { parsePrincipalFromParam, resolveAclSearchParams } from './principal-utils';

describe('parsePrincipalFromParam', () => {
  test('bare name defaults to User principal type', () => {
    expect(parsePrincipalFromParam('alice')).toEqual({ principalType: 'User', principalName: 'alice' });
  });

  test('User: prefix is parsed correctly', () => {
    expect(parsePrincipalFromParam('User:alice')).toEqual({ principalType: 'User', principalName: 'alice' });
  });

  test('Group: prefix is parsed correctly', () => {
    expect(parsePrincipalFromParam('Group:mygroup')).toEqual({ principalType: 'Group', principalName: 'mygroup' });
  });

  test('RedpandaRole: prefix is parsed correctly', () => {
    expect(parsePrincipalFromParam('RedpandaRole:some-role')).toEqual({
      principalType: 'RedpandaRole',
      principalName: 'some-role',
    });
  });

  test('only the first colon is used as the separator', () => {
    expect(parsePrincipalFromParam('User:alice:with:colons')).toEqual({
      principalType: 'User',
      principalName: 'alice:with:colons',
    });
  });

  test('Group with colon in name uses first colon as separator', () => {
    expect(parsePrincipalFromParam('Group:team:a')).toEqual({ principalType: 'Group', principalName: 'team:a' });
  });
});

describe('resolveAclSearchParams', () => {
  test('returns sharedConfig with User principal for principalType=User', () => {
    const result = resolveAclSearchParams({ principalType: 'User', principalName: 'alice' });
    expect(result.sharedConfig).toEqual({ principal: 'User:alice', host: '*' });
    expect(result.principalType).toBe('User:');
  });

  test('returns sharedConfig with RedpandaRole principal', () => {
    const result = resolveAclSearchParams({ principalType: 'RedpandaRole', principalName: 'admin' });
    expect(result.sharedConfig).toEqual({ principal: 'RedpandaRole:admin', host: '*' });
    expect(result.principalType).toBe('RedpandaRole:');
  });

  test('returns sharedConfig with Group principal', () => {
    const result = resolveAclSearchParams({ principalType: 'Group', principalName: 'team-a' });
    expect(result.sharedConfig).toEqual({ principal: 'Group:team-a', host: '*' });
    expect(result.principalType).toBe('Group:');
  });

  test('is case-insensitive for principalType', () => {
    const result = resolveAclSearchParams({ principalType: 'USER', principalName: 'bob' });
    expect(result.sharedConfig).toEqual({ principal: 'User:bob', host: '*' });
    expect(result.principalType).toBe('User:');
  });

  test('returns undefined sharedConfig when principalName is missing', () => {
    const result = resolveAclSearchParams({ principalType: 'User' });
    expect(result.sharedConfig).toBeUndefined();
    expect(result.principalType).toBe('User:');
  });

  test('returns undefined sharedConfig when principalType is missing', () => {
    const result = resolveAclSearchParams({ principalName: 'alice' });
    expect(result.sharedConfig).toBeUndefined();
    expect(result.principalType).toBeUndefined();
  });

  test('returns undefined for both when no params', () => {
    const result = resolveAclSearchParams({});
    expect(result.sharedConfig).toBeUndefined();
    expect(result.principalType).toBeUndefined();
  });

  test('returns undefined for unknown principalType', () => {
    const result = resolveAclSearchParams({ principalType: 'Unknown', principalName: 'alice' });
    expect(result.sharedConfig).toBeUndefined();
    expect(result.principalType).toBeUndefined();
  });
});
