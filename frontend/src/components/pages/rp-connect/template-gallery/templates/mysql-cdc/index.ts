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

import baseYaml from './config.yaml?raw';
import type { PipelineTemplate } from '../../pipeline-template-types';
import { dsnSlot, targetTopicSlot } from '../shared-slots';

export const mysqlCdcTemplate: PipelineTemplate = {
  id: 'mysql-cdc-to-redpanda',
  name: 'MySQL CDC to Redpanda',
  description: 'Capture binlog row events from MySQL into a Redpanda topic.',
  category: 'cdc',
  source: { component: 'mysql_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 8,
  defaultPipelineName: 'mysql-cdc-pipeline',
  slots: [
    dsnSlot('dsn', 'MySQL', 'MYSQL_DSN', 'dsn'),
    {
      id: 'includedTable',
      section: 'source',
      kind: 'string',
      label: 'Source tables',
      description:
        'Bare table names — no database prefix; the database comes from the DSN. Comma-separate multiple tables.',
      placeholder: 'users, orders',
      required: true,
      list: true,
      // Mirrors the connector's own validation (mysql/validate.go) so rejects surface in the form.
      entryPattern: {
        regex: /^[a-zA-Z0-9_$]+$/,
        message: 'Table names must be bare identifiers — no database prefix or dots.',
      },
      schemaField: 'tables',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
