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
import { dsnSlot } from '../shared-slots';

export const kafkaMigrationTemplate: PipelineTemplate = {
  id: 'kafka-to-redpanda-migration',
  name: 'Kafka to Redpanda migration',
  description: 'Replicate topics, schemas, and consumer offsets from a Kafka cluster into Redpanda.',
  category: 'migration',
  source: { component: 'redpanda_migrator', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 15,
  defaultPipelineName: 'kafka-to-redpanda-migration',
  slots: [
    {
      id: 'sourceBrokers',
      section: 'source',
      kind: 'string',
      label: 'Source Kafka brokers',
      description: 'Comma-separated bootstrap broker list.',
      placeholder: 'broker1.example.com:9092,broker2.example.com:9092',
      required: true,
      schemaField: 'seed_brokers',
    },
    {
      id: 'sourceTopicsRegex',
      section: 'source',
      kind: 'string',
      label: 'Source topic regex',
      description: 'Topics matching this regex will be migrated.',
      placeholder: '.*',
      default: '.*',
      required: true,
      schemaField: 'topics',
    },
    // SASL fields live under sasl[].{username,password}; not schema-bound because the dotted-path resolver can't index arrays.
    dsnSlot('sourceUser', 'Source SASL user', 'SOURCE_KAFKA_USER'),
    dsnSlot('sourcePassword', 'Source SASL password', 'SOURCE_KAFKA_PASSWORD'),
  ],
  baseYaml,
};
