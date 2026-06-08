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

export const sqlserverCdcTemplate: PipelineTemplate = {
  id: 'sqlserver-cdc-to-redpanda',
  name: 'SQL Server CDC to Redpanda',
  description: 'Capture CDC-enabled tables from SQL Server into a Redpanda topic.',
  category: 'cdc',
  source: { component: 'sql_server_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 10,
  defaultPipelineName: 'sqlserver-cdc-pipeline',
  slots: [
    dsnSlot('dsn', 'SQL Server', 'SQLSERVER_DSN', 'dsn'),
    {
      id: 'includedTable',
      section: 'source',
      kind: 'string',
      label: 'Source table',
      description: 'Schema-qualified table to capture (e.g. dbo.users). Add more in the YAML editor afterwards.',
      placeholder: 'dbo.users',
      required: true,
      schemaField: 'tables',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
