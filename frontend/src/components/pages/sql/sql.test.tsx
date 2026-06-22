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

import { bridgeTopicForQuery, firstKeyword, isReadQuery } from './sql';
import type { Catalog } from './sql-types';

const CATALOGS: Catalog[] = [
  {
    name: 'default_redpanda_catalog',
    displayLabel: 'Redpanda Catalog',
    engine: 'redpanda',
    namespaces: [
      {
        id: 'default_redpanda_catalog.public',
        name: 'public',
        tables: [
          {
            id: 'default_redpanda_catalog.public.cars_table',
            name: 'cars_table',
            namespaceName: 'public',
            catalogName: 'default_redpanda_catalog',
            topicName: 'cars-telemetry.v1',
          },
        ],
      },
    ],
  },
];

describe('sql helpers', () => {
  test('firstKeyword skips comments and uppercases', () => {
    expect(firstKeyword('select * from t')).toBe('SELECT');
    expect(firstKeyword('-- a comment\nselect * from t')).toBe('SELECT');
    expect(firstKeyword('/* block */ INSERT INTO t VALUES (1)')).toBe('INSERT');
    expect(firstKeyword('  \n grant all on t to u')).toBe('GRANT');
    expect(firstKeyword('-- only a comment')).toBe('');
    expect(firstKeyword('')).toBe('');
  });

  test('firstKeyword sees past a leading paren', () => {
    expect(firstKeyword('(SELECT * FROM t)')).toBe('SELECT');
    expect(firstKeyword('  ( ( select 1 )')).toBe('SELECT');
  });

  test('isReadQuery allows SELECT and WITH (CTEs), rejects writes', () => {
    expect(isReadQuery('SELECT * FROM t')).toBe(true);
    expect(isReadQuery('WITH t AS (SELECT 1) SELECT * FROM t')).toBe(true);
    expect(isReadQuery('(SELECT 1)')).toBe(true);
    expect(isReadQuery('INSERT INTO t VALUES (1)')).toBe(false);
    expect(isReadQuery('CREATE TABLE t (a int)')).toBe(false);
    expect(isReadQuery('')).toBe(false);
  });

  test('bridgeTopicForQuery resolves a single Redpanda SQL table to its backing topic', () => {
    expect(bridgeTopicForQuery('SELECT * FROM default_redpanda_catalog=>cars_table LIMIT 100', CATALOGS)).toBe(
      'cars-telemetry.v1'
    );
  });

  test('bridgeTopicForQuery ignores joins and non-Redpanda catalogs', () => {
    expect(
      bridgeTopicForQuery(
        'SELECT * FROM default_redpanda_catalog=>cars_table c JOIN default_redpanda_catalog=>drivers d ON c.id = d.id',
        CATALOGS
      )
    ).toBeNull();
    expect(bridgeTopicForQuery('SELECT * FROM iceberg=>cars_table', CATALOGS)).toBeNull();
  });
});
