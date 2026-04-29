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

import { mergePrincipals } from './use-principal-list';

describe('mergePrincipals', () => {
  test('returns SCRAM users as isScramUser=true', () => {
    const result = mergePrincipals([{ name: 'alice' }], [], new Map());

    expect(result).toEqual([{ name: 'alice', principalType: 'User', isScramUser: true }]);
  });

  test('adds ACL principals not in SCRAM users', () => {
    const result = mergePrincipals([{ name: 'alice' }], [{ principalType: 'User', principalName: 'bob' }], new Map());

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ name: 'bob', principalType: 'User', isScramUser: false });
  });

  test('marks ACL principals that are also SCRAM users', () => {
    const result = mergePrincipals([{ name: 'alice' }], [{ principalType: 'User', principalName: 'alice' }], new Map());

    // alice should NOT be duplicated — she's already in the SCRAM list
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'alice', principalType: 'User', isScramUser: true });
  });

  test('includes Group principals from ACLs', () => {
    const result = mergePrincipals([], [{ principalType: 'Group', principalName: 'engineering' }], new Map());

    expect(result).toEqual([{ name: 'engineering', principalType: 'Group', isScramUser: false }]);
  });

  test('excludes wildcard principals', () => {
    const result = mergePrincipals([], [{ principalType: 'User', principalName: '*' }], new Map());

    expect(result).toHaveLength(0);
  });

  test('adds role members not in SCRAM or ACL lists', () => {
    const result = mergePrincipals([{ name: 'alice' }], [], new Map([['admin-role', [{ name: 'bob' }]]]));

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ name: 'bob', principalType: 'User', isScramUser: false });
  });

  test('does not duplicate role members already in SCRAM users', () => {
    const result = mergePrincipals([{ name: 'alice' }], [], new Map([['admin-role', [{ name: 'alice' }]]]));

    expect(result).toHaveLength(1);
  });

  test('merges all three sources correctly', () => {
    const result = mergePrincipals(
      [{ name: 'alice' }, { name: 'bob' }],
      [
        { principalType: 'User', principalName: 'charlie' },
        { principalType: 'Group', principalName: 'eng' },
      ],
      new Map([['viewer', [{ name: 'dave' }, { name: 'alice' }]]])
    );

    const names = result.map((p) => p.name);
    expect(names).toEqual(['alice', 'bob', 'charlie', 'eng', 'dave']);
    expect(result.find((p) => p.name === 'eng')?.principalType).toBe('Group');
    expect(result.find((p) => p.name === 'charlie')?.isScramUser).toBe(false);
    expect(result.find((p) => p.name === 'alice')?.isScramUser).toBe(true);
  });

  test('skips RedpandaRole principal types from ACLs', () => {
    const result = mergePrincipals([], [{ principalType: 'RedpandaRole', principalName: 'my-role' }], new Map());

    expect(result).toHaveLength(0);
  });
});
