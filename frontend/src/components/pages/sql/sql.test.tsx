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

import { bridgeTopicForQuery, firstKeyword } from './sql';
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
