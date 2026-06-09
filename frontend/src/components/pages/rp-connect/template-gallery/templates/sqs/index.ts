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

export const sqsTemplate: PipelineTemplate = {
  id: 'sqs-to-redpanda',
  name: 'AWS SQS to Redpanda',
  description: 'Drain messages from an Amazon SQS queue into a Redpanda topic.',
  category: 'ingest',
  source: { component: 'aws_sqs', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 5,
  defaultPipelineName: 'sqs-to-redpanda',
  slots: [
    {
      id: 'queueUrl',
      section: 'source',
      kind: 'string',
      label: 'SQS queue URL',
      placeholder: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
      required: true,
      schemaField: 'url',
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
