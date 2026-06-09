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
import { consumerGroupSlot, dsnSlot, sourceTopicSlot } from '../shared-slots';

export const postgresSinkTemplate: PipelineTemplate = {
  id: 'redpanda-to-postgres',
  name: 'Redpanda to Postgres',
  description: 'Write records from a Redpanda topic into a Postgres table.',
  category: 'analytics',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'sql_raw', logoOverride: 'postgres_cdc', type: 'output' },
  setupTimeMinutes: 6,
  defaultPipelineName: 'redpanda-to-postgres',
  slots: [
    sourceTopicSlot,
    consumerGroupSlot,
    dsnSlot('dsn', 'Postgres', 'POSTGRES_DSN', 'dsn', 'sink'),
    {
      id: 'tableName',
      section: 'sink',
      kind: 'string',
      label: 'Target table',
      required: true,
    },
  ],
  baseYaml,
};
