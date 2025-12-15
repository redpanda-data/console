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

import { describe, expect, test } from 'vitest';

import { getRandomAnimalName } from './name.utils';

const NAME_PATTERN = /^[a-z]+-[a-z]+-[a-z]+$/;
const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

describe('getRandomAnimalName', () => {
  test('should generate a name with three parts separated by hyphens', () => {
    const name = getRandomAnimalName();
    const parts = name.split('-');

    expect(parts).toHaveLength(3);
  });

  test('should generate lowercase names', () => {
    const name = getRandomAnimalName();

    expect(name).toBe(name.toLowerCase());
  });

  test('should generate different names on multiple calls', () => {
    const names = new Set<string>();

    // Generate 2 names and check we get some variety
    for (let i = 0; i < 2; i++) {
      names.add(getRandomAnimalName());
    }

    // With the word lists we have, we should get more than 1 unique name
    expect(names.size).toBeGreaterThan(1);
  });

  test('should generate valid names', () => {
    const name = getRandomAnimalName();

    // Should match pattern: word-word-word (lowercase, hyphens)
    expect(name).toMatch(NAME_PATTERN);
  });

  test('should generate names that work as postgres table names when transformed', () => {
    const name = getRandomAnimalName();
    const tableName = name.replace(/-/g, '_');

    // Should match postgres table name requirements (starts with letter, alphanumeric + underscores)
    expect(tableName).toMatch(TABLE_NAME_PATTERN);
  });
});
