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

export const oracleCdcTemplate: PipelineTemplate = {
  id: 'oracle-cdc-to-redpanda',
  name: 'Oracle CDC to Redpanda',
  description: 'Capture LogMiner-based row changes from Oracle into a Redpanda topic.',
  category: 'cdc',
  source: { component: 'oracledb_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 12,
  defaultPipelineName: 'oracle-cdc-pipeline',
  slots: [
    dsnSlot('dsn', 'Oracle', 'ORACLE_DSN', 'connection_string'),
    {
      id: 'includedTable',
      section: 'source',
      kind: 'string',
      label: 'Source table',
      description: 'Schema-qualified table to capture (e.g. HR.EMPLOYEES). Add more in the YAML editor afterwards.',
      placeholder: 'HR.EMPLOYEES',
      required: true,
      schemaField: 'include',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
