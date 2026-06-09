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

export const pubsubTemplate: PipelineTemplate = {
  id: 'pubsub-to-redpanda',
  name: 'GCP Pub/Sub to Redpanda',
  description: 'Subscribe to a Google Cloud Pub/Sub subscription and publish to Redpanda.',
  category: 'ingest',
  source: { component: 'gcp_pubsub', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 6,
  defaultPipelineName: 'pubsub-to-redpanda',
  slots: [
    {
      id: 'project',
      section: 'source',
      kind: 'string',
      label: 'GCP project ID',
      required: true,
      schemaField: 'project',
    },
    {
      id: 'subscription',
      section: 'source',
      kind: 'string',
      label: 'Pub/Sub subscription',
      required: true,
      schemaField: 'subscription',
    },
    dsnSlot('credentialsJson', 'GCP service-account JSON', 'GCP_SERVICE_ACCOUNT_JSON', 'credentials_json'),
    targetTopicSlot,
  ],
  baseYaml,
};
