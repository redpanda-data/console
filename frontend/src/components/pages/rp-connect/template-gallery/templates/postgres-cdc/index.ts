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
import { dsnSlot, targetTopicSlot, toReplicationSlotName } from '../shared-slots';

export const postgresCdcTemplate: PipelineTemplate = {
  id: 'postgres-cdc-to-redpanda',
  name: 'Postgres CDC to Redpanda',
  description: 'Stream row-level changes from Postgres into a Redpanda topic via logical replication.',
  category: 'cdc',
  source: { component: 'postgres_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 8,
  defaultPipelineName: 'postgres-cdc-pipeline',
  slots: [
    dsnSlot('dsn', 'Postgres', 'POSTGRES_DSN', 'dsn'),
    {
      id: 'schema',
      section: 'source',
      kind: 'string',
      label: 'Schema',
      description: 'Postgres schema the source tables live in.',
      // Schema-required with no engine default; fall back to the conventional 'public'.
      required: false,
      placeholder: 'public',
      defaultWhenBlank: () => 'public',
      schemaField: 'schema',
    },
    {
      id: 'slotName',
      section: 'source',
      kind: 'string',
      label: 'Logical replication slot',
      // Optional in the form; derive a stable name from the pipeline when blank so redeploys reuse the slot instead of orphaning one.
      required: false,
      placeholder: 'Auto-generated from pipeline name if blank',
      schemaField: 'slot_name',
      defaultWhenBlank: ({ pipelineName }) => toReplicationSlotName(pipelineName),
    },
    {
      id: 'includedTable',
      section: 'source',
      kind: 'string',
      label: 'Source tables',
      description: 'Bare table names inside the schema above (no schema prefix). Comma-separate multiple tables.',
      placeholder: 'users, orders',
      list: true,
      schemaField: 'tables',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
