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
      label: 'Iceberg REST catalog URL',
      placeholder: 'https://catalog.example.com/api/catalog',
      required: true,
      schemaField: 'catalog.url',
    },
    {
      id: 'warehouse',
      section: 'sink',
      kind: 'string',
      label: 'Catalog warehouse',
      description: 'Leave blank if your catalog serves a default warehouse.',
      placeholder: 'redpanda-catalog',
      // Optional: many REST catalogs resolve a default warehouse; the stitcher drops the line when blank.
      required: false,
      schemaField: 'catalog.warehouse',
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
    {
      id: 'storageBucket',
      section: 'sink',
      kind: 'string',
      label: 'S3 storage bucket',
      // The engine requires exactly one storage backend (aws_s3 / gcp_cloud_storage /
      // azure_blob_storage) — a one-of the schema can't express, so the schema alone
      // wouldn't flag this as required. The template targets S3; other backends via YAML.
      description: 'Bucket that holds the Iceberg data files. For GCS or Azure storage, edit the YAML afterwards.',
      placeholder: 'my-iceberg-bucket',
      required: true,
      schemaField: 'storage.aws_s3.bucket',
    },
    {
      id: 'storageRegion',
      section: 'sink',
      kind: 'string',
      label: 'S3 bucket region',
      description: 'Leave blank to resolve from the AWS environment.',
      placeholder: 'us-east-1',
      required: false,
      schemaField: 'storage.aws_s3.region',
    },
  ],
  baseYaml,
};
