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

export const snowflakeTemplate: PipelineTemplate = {
  id: 'redpanda-to-snowflake',
  name: 'Redpanda to Snowflake',
  description: 'Stream records from a Redpanda topic into a Snowflake table via Snowpipe Streaming.',
  category: 'analytics',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'snowflake_streaming', type: 'output' },
  setupTimeMinutes: 10,
  defaultPipelineName: 'redpanda-to-snowflake',
  slots: [
    sourceTopicSlot,
    consumerGroupSlot,
    {
      id: 'account',
      section: 'sink',
      kind: 'string',
      label: 'Snowflake account',
      placeholder: 'xy12345.us-east-1',
      required: true,
      schemaField: 'account',
    },
    {
      id: 'user',
      section: 'sink',
      kind: 'string',
      label: 'Snowflake user',
      required: true,
      schemaField: 'user',
    },
    {
      id: 'role',
      section: 'sink',
      kind: 'string',
      label: 'Snowflake role',
      placeholder: 'ACCOUNTADMIN',
      required: true,
      schemaField: 'role',
    },
    dsnSlot('privateKey', 'Snowflake RSA private key', 'SNOWFLAKE_PRIVATE_KEY', 'private_key', 'sink'),
    {
      id: 'database',
      section: 'sink',
      kind: 'string',
      label: 'Database',
      required: true,
      schemaField: 'database',
    },
    {
      id: 'schema',
      section: 'sink',
      kind: 'string',
      label: 'Schema',
      required: true,
      schemaField: 'schema',
    },
    {
      id: 'table',
      section: 'sink',
      kind: 'string',
      label: 'Table',
      required: true,
      schemaField: 'table',
    },
  ],
  baseYaml,
};
