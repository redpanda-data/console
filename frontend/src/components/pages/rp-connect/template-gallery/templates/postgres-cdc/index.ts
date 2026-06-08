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
      id: 'slotName',
      section: 'source',
      kind: 'string',
      label: 'Logical replication slot',
      // Optional in the form, but the connector lints `slot_name` as required.
      // Rather than force users to invent one, derive a stable name from the
      // pipeline when blank (see defaultWhenBlank) so the config always lints
      // clean and re-deploys reuse the same slot instead of orphaning one.
      required: false,
      placeholder: 'Auto-generated from pipeline name if blank',
      schemaField: 'slot_name',
      defaultWhenBlank: ({ pipelineName }) => toReplicationSlotName(pipelineName),
    },
    {
      id: 'includedTable',
      section: 'source',
      kind: 'string',
      label: 'Source table',
      placeholder: 'public.users',
      schemaField: 'tables',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
