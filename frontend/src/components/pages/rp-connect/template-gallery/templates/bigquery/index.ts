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

export const bigqueryTemplate: PipelineTemplate = {
  id: 'redpanda-to-bigquery',
  name: 'Redpanda to BigQuery',
  description: 'Stream records from a Redpanda topic into a BigQuery table.',
  category: 'analytics',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'gcp_bigquery', type: 'output' },
  setupTimeMinutes: 10,
  defaultPipelineName: 'redpanda-to-bigquery',
  slots: [
    sourceTopicSlot,
    consumerGroupSlot,
    {
      id: 'project',
      section: 'sink',
      kind: 'string',
      label: 'GCP project ID',
      // Optional: connector falls back to the project in the credentials JSON or GOOGLE_CLOUD_PROJECT.
      required: false,
      placeholder: 'Inferred from credentials if blank',
      schemaField: 'project',
    },
    {
      id: 'dataset',
      section: 'sink',
      kind: 'string',
      label: 'BigQuery dataset',
      required: true,
      schemaField: 'dataset',
    },
    {
      id: 'table',
      section: 'sink',
      kind: 'string',
      label: 'BigQuery table',
      required: true,
      schemaField: 'table',
    },
    dsnSlot('credentialsJson', 'GCP service-account JSON', 'GCP_SERVICE_ACCOUNT_JSON', 'credentials_json', 'sink'),
  ],
  baseYaml,
};
