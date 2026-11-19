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

import { describe, expect, test } from '@rstest/core';

import type { TemplateSlot } from './pipeline-template-types';
import { buildSchema } from './template-form-panel';
import { mysqlCdcTemplate } from './templates/mysql-cdc';

const NAME = { __pipelineName: 'p' };
const BARE_IDENTIFIER = /^[a-zA-Z0-9_$]+$/u;

const listSlot = (overrides: Partial<TemplateSlot> = {}) =>
  ({
    id: 'tables',
    kind: 'string',
    section: 'source',
    label: 'Source tables',
    required: true,
    list: true,
    entryPattern: { regex: BARE_IDENTIFIER, message: 'bare identifiers only' },
    ...overrides,
  }) as TemplateSlot;

describe('buildSchema slot validation', () => {
  test('entryPattern validates every comma-separated entry', () => {
    const schema = buildSchema([listSlot()]);
    expect(schema.safeParse({ ...NAME, tables: 'users, orders' }).success).toBe(true);
    expect(schema.safeParse({ ...NAME, tables: 'users, mydb.orders' }).success).toBe(false);
  });

  test('required list slot rejects separator-only values', () => {
    const schema = buildSchema([listSlot()]);
    expect(schema.safeParse({ ...NAME, tables: ' , ' }).success).toBe(false);
  });

  test('optional pattern slot allows blank but rejects a bad non-blank value', () => {
    const schema = buildSchema([listSlot({ required: false })]);
    expect(schema.safeParse({ ...NAME, tables: '' }).success).toBe(true);
    expect(schema.safeParse({ ...NAME, tables: 'db.users' }).success).toBe(false);
  });

  test('the real mysql-cdc template rejects dotted table names in the form', () => {
    // the form must catch that before deploy.
    const schema = buildSchema(mysqlCdcTemplate.slots);
    const values = { ...NAME, dsn: 'MYSQL_DSN', includedTable: 'mydb.users', targetTopic: 'orders' };
    expect(schema.safeParse(values).success).toBe(false);
    expect(schema.safeParse({ ...values, includedTable: 'users' }).success).toBe(true);
  });
});
