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

import { bigqueryTemplate } from './bigquery';
import { dynamodbCdcTemplate } from './dynamodb-cdc';
import { httpTemplate } from './http';
import { icebergTemplate } from './iceberg';
import { kafkaMigrationTemplate } from './kafka-migration';
import { mongodbCdcTemplate } from './mongodb-cdc';
import { mysqlCdcTemplate } from './mysql-cdc';
import { oracleCdcTemplate } from './oracle-cdc';
import { postgresCdcTemplate } from './postgres-cdc';
import { postgresSinkTemplate } from './postgres-sink';
import { pubsubTemplate } from './pubsub';
import { redpandaMirrorTemplate } from './redpanda-mirror';
import { s3Template } from './s3';
import { snowflakeTemplate } from './snowflake';
import { sqlserverCdcTemplate } from './sqlserver-cdc';
import { sqsTemplate } from './sqs';
import type { PipelineTemplate } from '../pipeline-template-types';

// Registry order; the gallery regroups by category for display.
export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  postgresCdcTemplate,
  mysqlCdcTemplate,
  mongodbCdcTemplate,
  dynamodbCdcTemplate,
  sqlserverCdcTemplate,
  oracleCdcTemplate,
  s3Template,
  httpTemplate,
  sqsTemplate,
  pubsubTemplate,
  snowflakeTemplate,
  bigqueryTemplate,
  icebergTemplate,
  postgresSinkTemplate,
  kafkaMigrationTemplate,
  redpandaMirrorTemplate,
];

export const getTemplateById = (id: string): PipelineTemplate | undefined =>
  PIPELINE_TEMPLATES.find((t) => t.id === id);
