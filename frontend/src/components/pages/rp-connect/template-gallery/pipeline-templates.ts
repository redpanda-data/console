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

import type { PipelineTemplate } from './pipeline-template-types';
import { bigqueryTemplate } from './templates/bigquery';
import { dynamodbCdcTemplate } from './templates/dynamodb-cdc';
import { httpTemplate } from './templates/http';
import { icebergTemplate } from './templates/iceberg';
import { kafkaMigrationTemplate } from './templates/kafka-migration';
import { mongodbCdcTemplate } from './templates/mongodb-cdc';
import { mysqlCdcTemplate } from './templates/mysql-cdc';
import { oracleCdcTemplate } from './templates/oracle-cdc';
import { postgresCdcTemplate } from './templates/postgres-cdc';
import { postgresSinkTemplate } from './templates/postgres-sink';
import { pubsubTemplate } from './templates/pubsub';
import { redpandaMirrorTemplate } from './templates/redpanda-mirror';
import { s3Template } from './templates/s3';
import { snowflakeTemplate } from './templates/snowflake';
import { sqlserverCdcTemplate } from './templates/sqlserver-cdc';
import { sqsTemplate } from './templates/sqs';

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
