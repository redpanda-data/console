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
import { consumerGroupSlot, sourceTopicSlot } from '../shared-slots';

export const icebergTemplate: PipelineTemplate = {
  id: 'redpanda-to-iceberg',
  name: 'Redpanda to Iceberg',
  description: 'Write records from a Redpanda topic into an Apache Iceberg table.',
  category: 'analytics',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'iceberg', type: 'output' },
  setupTimeMinutes: 12,
  defaultPipelineName: 'redpanda-to-iceberg',
  slots: [
    sourceTopicSlot,
    consumerGroupSlot,
    {
      id: 'catalogUri',
      section: 'sink',
      kind: 'string',
      label: 'Iceberg catalog URI',
      placeholder: 'https://glue.us-east-1.amazonaws.com',
      required: true,
      schemaField: 'catalog_uri',
    },
    {
      id: 'warehouse',
      section: 'sink',
      kind: 'string',
      label: 'Warehouse location',
      placeholder: 's3://my-bucket/warehouse',
      required: true,
      schemaField: 'warehouse',
    },
    {
      id: 'namespace',
      section: 'sink',
      kind: 'string',
      label: 'Namespace',
      required: true,
      schemaField: 'namespace',
    },
    {
      id: 'tableName',
      section: 'sink',
      kind: 'string',
      label: 'Table name',
      required: true,
      schemaField: 'table',
    },
  ],
  baseYaml,
};
