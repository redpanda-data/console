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
import { targetTopicSlot } from '../shared-slots';

export const httpTemplate: PipelineTemplate = {
  id: 'http-to-redpanda',
  name: 'HTTP endpoint to Redpanda',
  description: 'Expose an HTTP endpoint that buffers incoming requests onto a Redpanda topic.',
  category: 'ingest',
  source: { component: 'http_server', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 3,
  defaultPipelineName: 'http-to-redpanda',
  slots: [
    {
      id: 'address',
      section: 'source',
      kind: 'string',
      label: 'Listen address',
      description: 'TCP address the HTTP server should bind to.',
      default: '0.0.0.0:4195',
      required: true,
      schemaField: 'address',
    },
    {
      id: 'path',
      section: 'source',
      kind: 'string',
      label: 'Request path',
      default: '/post',
      required: true,
      schemaField: 'path',
    },
    targetTopicSlot,
  ],
  baseYaml,
};
