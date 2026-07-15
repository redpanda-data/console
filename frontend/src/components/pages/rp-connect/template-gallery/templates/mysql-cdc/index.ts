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
      label: 'Source table',
      // The connector rejects dotted names (validate.go: ^[a-zA-Z0-9_$]+$); the database comes from the DSN.
      description:
        'Bare table name — no database prefix; the database comes from the DSN. Add more in the YAML editor afterwards.',
      placeholder: 'users',
      required: true,
      schemaField: 'tables',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
