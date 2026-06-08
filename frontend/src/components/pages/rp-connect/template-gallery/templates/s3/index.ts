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

export const s3Template: PipelineTemplate = {
  id: 's3-to-redpanda',
  name: 'S3 to Redpanda',
  description: 'Read objects from an Amazon S3 bucket and publish them to a Redpanda topic.',
  category: 'ingest',
  source: { component: 'aws_s3', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 5,
  defaultPipelineName: 's3-to-redpanda',
  slots: [
    {
      id: 'bucket',
      section: 'source',
      kind: 'string',
      label: 'S3 bucket name',
      required: true,
      schemaField: 'bucket',
    },
    {
      id: 'prefix',
      section: 'source',
      kind: 'string',
      label: 'Key prefix',
      description: 'Optional prefix to scope reads. Leave blank for the whole bucket.',
      // Connector treats absent prefix as "walk the whole bucket". Force optional
      // so the form doesn't block on schema-inferred required; stitcher drops the
      // line when blank.
      required: false,
      placeholder: 'Leave blank for whole bucket',
      schemaField: 'prefix',
    },
    {
      id: 'region',
      section: 'source',
      kind: 'string',
      label: 'AWS region',
      placeholder: 'us-east-1',
      required: true,
      schemaField: 'region',
    },
    dsnSlot('awsAccessKey', 'AWS access key', 'AWS_ACCESS_KEY_ID', 'credentials.id'),
    dsnSlot('awsSecretKey', 'AWS secret key', 'AWS_SECRET_ACCESS_KEY', 'credentials.secret'),
    targetTopicSlot,
  ],
  baseYaml,
};
