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

export const mongodbCdcTemplate: PipelineTemplate = {
  id: 'mongodb-cdc-to-redpanda',
  name: 'MongoDB CDC to Redpanda',
  description: 'Stream change-stream events from MongoDB into a Redpanda topic.',
  category: 'cdc',
  source: { component: 'mongodb_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 8,
  defaultPipelineName: 'mongodb-cdc-pipeline',
  slots: [
    dsnSlot('url', 'MongoDB', 'MONGODB_URL', 'url'),
    {
      id: 'database',
      section: 'source',
      kind: 'string',
      label: 'Database',
      description: 'Source MongoDB database name.',
      required: true,
      schemaField: 'database',
    },
    {
      id: 'collection',
      section: 'source',
      kind: 'string',
      label: 'Collections',
      description: 'Collections to stream changes from. Comma-separate multiple collections.',
      placeholder: 'orders, customers',
      required: true,
      list: true,
      schemaField: 'collections',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
