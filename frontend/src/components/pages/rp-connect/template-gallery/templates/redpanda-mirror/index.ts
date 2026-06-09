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

export const redpandaMirrorTemplate: PipelineTemplate = {
  id: 'redpanda-to-redpanda-mirrored',
  name: 'Redpanda to Redpanda mirrored',
  description: 'Mirror a topic from one Redpanda cluster to another for active-passive replication.',
  category: 'migration',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'redpanda_migrator', type: 'output' },
  setupTimeMinutes: 10,
  defaultPipelineName: 'redpanda-mirror',
  slots: [
    sourceTopicSlot,
    consumerGroupSlot,
    {
      id: 'destBrokers',
      section: 'sink',
      kind: 'string',
      label: 'Destination Redpanda brokers',
      description: 'Comma-separated bootstrap broker list for the destination cluster.',
      placeholder: 'broker1.example.com:9092',
      required: true,
      schemaField: 'seed_brokers',
    },
    {
      id: 'destTopic',
      section: 'sink',
      kind: 'string',
      label: 'Destination topic name',
      required: true,
      schemaField: 'topic',
    },
    // SASL fields live under sasl[].{username,password} — see note above.
    dsnSlot('destUser', 'Destination SASL user', 'DEST_KAFKA_USER'),
    dsnSlot('destPassword', 'Destination SASL password', 'DEST_KAFKA_PASSWORD'),
  ],
  baseYaml,
};
