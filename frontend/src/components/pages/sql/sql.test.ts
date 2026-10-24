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

import {
  blockedStatementError,
  bridgeTopicForQuery,
  firstKeyword,
  isCatalogChangingKeyword,
  isWriteKeyword,
} from './sql';
import type { Catalog } from './sql-types';
import { describe, expect, test } from 'bun:test';

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

  test('isWriteKeyword blocks writes/DDL/DCL but passes read-shaped statements', () => {
    // Read-shaped — not blocked.
    expect(isWriteKeyword('SELECT * FROM t')).toBe(false);
    expect(isWriteKeyword('WITH t AS (SELECT 1) SELECT * FROM t')).toBe(false);
    expect(isWriteKeyword('EXPLAIN SELECT 1')).toBe(false);
    expect(isWriteKeyword('(SELECT 1)')).toBe(false);
    expect(isWriteKeyword('SHOW TABLES')).toBe(false);
    // No longer blocked in the editor.
    expect(isWriteKeyword('CREATE TABLE t (a int)')).toBe(false);
    expect(isWriteKeyword('DROP TABLE t')).toBe(false);
    expect(isWriteKeyword('GRANT ALL ON t TO u')).toBe(false);
    // Writes / DDL / DCL — still blocked.
    expect(isWriteKeyword('INSERT INTO t VALUES (1)')).toBe(true);
    expect(isWriteKeyword('DELETE FROM t')).toBe(true);
  });

  test('blockedStatementError points REVOKE at Security and names any other blocked keyword', () => {
    expect(blockedStatementError('REVOKE')).toEqual({
      title: 'Manage access in Security',
      message: 'Grants are managed in Security in this release.',
    });
    expect(blockedStatementError('DELETE')).toEqual({
      title: 'Statement not allowed',
      message: 'Only read queries are supported in this release. Found "DELETE".',
    });
    expect(blockedStatementError('').message).toBe(
      'Only read queries are supported in this release. Found "empty statement".'
    );
  });

  test('isCatalogChangingKeyword matches DDL that adds or removes catalog objects', () => {
    expect(isCatalogChangingKeyword("CREATE TABLE rp=>orders WITH (topic = 'orders')")).toBe(true);
    expect(isCatalogChangingKeyword('drop table rp=>orders')).toBe(true);
    expect(isCatalogChangingKeyword('-- cleanup\nDROP TABLE rp=>orders')).toBe(true);
    expect(isCatalogChangingKeyword('ALTER TABLE t RENAME TO u')).toBe(true);
    expect(isCatalogChangingKeyword('RENAME TABLE t TO u')).toBe(true);
    expect(isCatalogChangingKeyword('TRUNCATE t')).toBe(false);
    expect(isCatalogChangingKeyword('SELECT * FROM rp=>orders')).toBe(false);
    expect(isCatalogChangingKeyword('SHOW TABLES')).toBe(false);
    expect(isCatalogChangingKeyword('')).toBe(false);
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

  test('bridgeTopicForQuery ignores `=>` inside comments and strings', () => {
    // A second `=>` in a trailing comment must not count as a second ref.
    expect(
      bridgeTopicForQuery('SELECT * FROM default_redpanda_catalog=>cars_table -- TODO cat=>orders', CATALOGS)
    ).toBe('cars-telemetry.v1');
    // A `=>` that only appears inside a string literal is not a table ref.
    expect(bridgeTopicForQuery("SELECT 'cat=>x' AS note", CATALOGS)).toBeNull();
  });
});
