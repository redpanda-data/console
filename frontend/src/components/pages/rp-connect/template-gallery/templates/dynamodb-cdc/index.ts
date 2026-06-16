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

export const dynamodbCdcTemplate: PipelineTemplate = {
  id: 'dynamodb-cdc-to-redpanda',
  name: 'DynamoDB CDC to Redpanda',
  description: 'Read DynamoDB Streams records and publish them to a Redpanda topic.',
  category: 'cdc',
  source: { component: 'aws_dynamodb_stream', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 10,
  defaultPipelineName: 'dynamodb-cdc-pipeline',
  slots: [
    {
      id: 'region',
      section: 'source',
      kind: 'string',
      label: 'AWS region',
      placeholder: 'us-east-1',
      required: true,
      schemaField: 'region',
    },
    {
      id: 'tableName',
      section: 'source',
      kind: 'string',
      label: 'DynamoDB table',
      required: true,
      schemaField: 'table',
    },
    dsnSlot('awsAccessKey', 'AWS access key', 'AWS_ACCESS_KEY_ID', 'credentials.id'),
    dsnSlot('awsSecretKey', 'AWS secret key', 'AWS_SECRET_ACCESS_KEY', 'credentials.secret'),
    targetTopicSlot,
  ],
  baseYaml,
};
