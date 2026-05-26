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

// biome-ignore-all lint/suspicious/noTemplateCurlyInString: YAML/Bloblang use ${...} as their own native templating syntax, not JS template strings.

import type { PipelineTemplate } from './pipeline-template-types';

const dsnSlot = (id: string, dbName: string, suggested: string, schemaField?: string) => ({
  id,
  section: 'source' as const,
  kind: 'secret' as const,
  label: `${dbName} connection DSN`,
  description: `Stored as a Cloud secret. Referenced in YAML as \${secrets.${suggested}}.`,
  suggestedName: suggested,
  required: true,
  schemaField,
});

const targetTopicSlot = {
  id: 'targetTopic',
  section: 'sink' as const,
  kind: 'topic' as const,
  label: 'Target Redpanda topic',
  description: 'Records will be written to this topic.',
  required: true,
  schemaField: 'topic',
};

const sourceTopicSlot = {
  id: 'sourceTopic',
  section: 'source' as const,
  kind: 'topic' as const,
  label: 'Source Redpanda topic',
  description: 'Records will be read from this topic.',
  required: true,
  schemaField: 'topics',
};

const consumerGroupSlot = {
  id: 'consumerGroup',
  section: 'options' as const,
  kind: 'string' as const,
  label: 'Consumer group',
  description: 'Identifier used to track read offsets for the source topic.',
  placeholder: 'redpanda-template-consumer',
  required: true,
  schemaField: 'consumer_group',
};

// Curated catalog (PRD §8). Every required slot must be referenced as
// `${slot.X}` in the template's `baseYaml`; deploy is pure substitution.
export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  // ─────────── CDC sources to Redpanda ───────────
  {
    id: 'postgres-cdc-to-redpanda',
    name: 'Postgres CDC to Redpanda',
    description: 'Stream row-level changes from Postgres into a Redpanda topic via logical replication.',
    category: 'cdc',
    source: { component: 'postgres_cdc', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 8,
    defaultPipelineName: 'postgres-cdc-pipeline',
    slots: [
      dsnSlot('dsn', 'Postgres', 'POSTGRES_DSN', 'dsn'),
      {
        id: 'slotName',
        section: 'source',
        kind: 'string',
        label: 'Logical replication slot',
        // Schema-wise the field looks required (no `optional` flag set in the proto),
        // but the connector auto-generates a name when the key is absent. Force-mark
        // optional so the form lets users leave it blank, and let stitchTemplateYaml
        // drop the line entirely so the connector sees no `slot_name` key.
        required: false,
        placeholder: 'Auto-generated if blank',
        schemaField: 'slot_name',
      },
      {
        id: 'includedTable',
        section: 'source',
        kind: 'string',
        label: 'Source table',
        placeholder: 'public.users',
        schemaField: 'tables',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  postgres_cdc:
    # ── Connection (filled in from the form) ────────────────────────────────
    dsn: \${slot.dsn}
    schema: public                         # change if your tables aren't in 'public'
    slot_name: \${slot.slotName}
    tables:
      - \${slot.includedTable}

    # ── Snapshot of existing rows before streaming changes ──────────────────
    stream_snapshot: true                  # capture current rows on first run
    # snapshot_batch_size: 0               # 0 = let the connector pick a safe size
    # snapshot_memory_safety_factor: 0
    # max_parallel_snapshot_tables: 0

    # ── Replication tuning ──────────────────────────────────────────────────
    checkpoint_limit: 1024                 # outstanding messages before backpressure
    # temporary_slot: false                # set true if you don't need durable slots
    # pg_standby_timeout: 10s
    # pg_wal_monitor_interval: 3s

    # ── Transaction markers (most users leave these off) ────────────────────
    # include_transaction_markers: false

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true

    # ── Optional knobs ──────────────────────────────────────────────────────
    # key: \${! json("table") }            # partition by source table
    # partitioner: murmur2_hash
    # timeout: 10s
`,
  },

  {
    id: 'mysql-cdc-to-redpanda',
    name: 'MySQL CDC to Redpanda',
    description: 'Capture binlog row events from MySQL into a Redpanda topic.',
    category: 'cdc',
    source: { component: 'mysql_cdc', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 8,
    defaultPipelineName: 'mysql-cdc-pipeline',
    slots: [
      dsnSlot('dsn', 'MySQL', 'MYSQL_DSN', 'dsn'),
      {
        id: 'includedTable',
        section: 'source',
        kind: 'string',
        label: 'Source table',
        description: 'Fully-qualified table to capture (e.g. mydb.users). Add more in the YAML editor afterwards.',
        placeholder: 'mydb.users',
        required: true,
        schemaField: 'tables',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  mysql_cdc:
    # ── Connection (filled in from the form) ────────────────────────────────
    dsn: \${slot.dsn}
    tables:
      - \${slot.includedTable}

    # ── Snapshot of existing rows before streaming changes ──────────────────
    stream_snapshot: true                  # capture current rows on first run
    # snapshot_max_batch_size: 0           # 0 = let the connector pick a safe size

    # ── Binlog tuning ───────────────────────────────────────────────────────
    checkpoint_limit: 1024                 # outstanding messages before backpressure
    # heartbeat_interval: 5s
    # flavor: mysql                        # use 'mariadb' for MariaDB clusters

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
    id: 'mongodb-cdc-to-redpanda',
    name: 'MongoDB CDC to Redpanda',
    description: 'Stream change-stream events from MongoDB into a Redpanda topic.',
    category: 'cdc',
    source: { component: 'mongodb_cdc', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 8,
    defaultPipelineName: 'mongodb-cdc-pipeline',
    slots: [
      dsnSlot('url', 'MongoDB', 'MONGODB_URL', 'url'),
      {
        id: 'database',
        section: 'source',
        kind: 'string',
        label: 'Database',
        description: 'Source MongoDB database name.',
        required: true,
        schemaField: 'database',
      },
      {
        id: 'collection',
        section: 'source',
        kind: 'string',
        label: 'Collection',
        description: 'Source MongoDB collection name.',
        required: true,
        schemaField: 'collections',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  mongodb_cdc:
    # ── Connection (filled in from the form) ────────────────────────────────
    url: \${slot.url}
    database: \${slot.database}
    collection: \${slot.collection}

    # ── Change-stream behavior ──────────────────────────────────────────────
    stream_snapshot: true                  # backfill existing documents first
    # full_document: updateLookup          # uncomment to include the post-image
    # checkpoint_limit: 1024
    # batch_size: 0                        # 0 = driver default

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
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
    baseYaml: `input:
  aws_dynamodb_stream:
    # ── Connection (filled in from the form) ────────────────────────────────
    table: \${slot.tableName}
    region: \${slot.region}
    credentials:
      id: \${slot.awsAccessKey}
      secret: \${slot.awsSecretKey}

    # ── Stream tuning ───────────────────────────────────────────────────────
    # batching:
    #   count: 100
    #   period: 1s
    # checkpoint_limit: 1024

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
    id: 'sqlserver-cdc-to-redpanda',
    name: 'SQL Server CDC to Redpanda',
    description: 'Capture CDC-enabled tables from SQL Server into a Redpanda topic.',
    category: 'cdc',
    source: { component: 'sql_server_cdc', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 10,
    defaultPipelineName: 'sqlserver-cdc-pipeline',
    slots: [
      dsnSlot('dsn', 'SQL Server', 'SQLSERVER_DSN', 'dsn'),
      {
        id: 'includedTable',
        section: 'source',
        kind: 'string',
        label: 'Source table',
        description: 'Schema-qualified table to capture (e.g. dbo.users). Add more in the YAML editor afterwards.',
        placeholder: 'dbo.users',
        required: true,
        schemaField: 'tables',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  sql_server_cdc:
    # ── Connection (filled in from the form) ────────────────────────────────
    dsn: \${slot.dsn}
    tables:
      - \${slot.includedTable}

    # ── Snapshot of existing rows before streaming changes ──────────────────
    stream_snapshot: true                  # capture current rows on first run

    # ── Polling tuning ──────────────────────────────────────────────────────
    checkpoint_limit: 1024                 # outstanding messages before backpressure
    # poll_interval: 1s

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
    id: 'oracle-cdc-to-redpanda',
    name: 'Oracle CDC to Redpanda',
    description: 'Capture LogMiner-based row changes from Oracle into a Redpanda topic.',
    category: 'cdc',
    source: { component: 'oracle_cdc', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 12,
    defaultPipelineName: 'oracle-cdc-pipeline',
    slots: [
      dsnSlot('dsn', 'Oracle', 'ORACLE_DSN', 'dsn'),
      {
        id: 'includedTable',
        section: 'source',
        kind: 'string',
        label: 'Source table',
        description: 'Schema-qualified table to capture (e.g. HR.EMPLOYEES). Add more in the YAML editor afterwards.',
        placeholder: 'HR.EMPLOYEES',
        required: true,
        schemaField: 'tables',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  oracle_cdc:
    # ── Connection (filled in from the form) ────────────────────────────────
    dsn: \${slot.dsn}
    tables:
      - \${slot.includedTable}

    # ── Snapshot of existing rows before streaming changes ──────────────────
    stream_snapshot: true                  # capture current rows on first run

    # ── LogMiner tuning ─────────────────────────────────────────────────────
    checkpoint_limit: 1024                 # outstanding messages before backpressure
    # log_mining_batch_size: 0             # 0 = let the connector decide
    # poll_interval: 1s

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  // ─────────── Ingest sources to Redpanda ───────────
  {
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
    baseYaml: `input:
  aws_s3:
    # ── Connection (filled in from the form) ────────────────────────────────
    bucket: \${slot.bucket}
    prefix: \${slot.prefix}
    region: \${slot.region}
    credentials:
      id: \${slot.awsAccessKey}
      secret: \${slot.awsSecretKey}

    # ── Read behavior ───────────────────────────────────────────────────────
    delete_objects: false                  # set true to remove objects after reading
    # force_path_style_urls: false         # set true for S3-compatible stores (MinIO etc.)
    # codec: all-bytes                     # legacy alias; prefer 'scanner' below

    # ── Object scanner — interpret each object's contents ───────────────────
    scanner:
      lines: {}                            # one message per line; swap for csv / json / tar etc.

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
    id: 'http-to-redpanda',
    name: 'HTTP endpoint to Redpanda',
    description: 'Expose an HTTP endpoint that buffers incoming requests onto a Redpanda topic.',
    category: 'ingest',
    source: { component: 'http_server', type: 'input' },
    sink: { component: 'redpanda', type: 'output' },
    setupTimeMinutes: 3,
    defaultPipelineName: 'http-to-redpanda',
    slots: [
      {
        id: 'address',
        section: 'source',
        kind: 'string',
        label: 'Listen address',
        description: 'TCP address the HTTP server should bind to.',
        default: '0.0.0.0:4195',
        required: true,
        schemaField: 'address',
      },
      {
        id: 'path',
        section: 'source',
        kind: 'string',
        label: 'Request path',
        default: '/post',
        required: true,
        schemaField: 'path',
      },
      targetTopicSlot,
    ],
    baseYaml: `input:
  http_server:
    # ── Server binding (filled in from the form) ────────────────────────────
    address: \${slot.address}
    path: \${slot.path}

    # ── Allowed methods ─────────────────────────────────────────────────────
    allowed_verbs:
      - POST
      # - PUT

    # ── Tuning ──────────────────────────────────────────────────────────────
    timeout: 5s                            # per-request timeout
    rate_limit: ""                         # set to a rate_limit resource name to throttle
    # sync_response:
    #   status: "200"
    #   headers:
    #     Content-Type: application/json

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
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
    baseYaml: `input:
  aws_sqs:
    # ── Connection (filled in from the form) ────────────────────────────────
    url: \${slot.queueUrl}
    region: \${slot.region}
    credentials:
      id: \${slot.awsAccessKey}
      secret: \${slot.awsSecretKey}

    # ── Polling tuning ──────────────────────────────────────────────────────
    max_number_of_messages: 10             # max batch per receive (1-10)
    wait_time_seconds: 20                  # long-poll wait (0 = short poll)
    # message_timeout: 30s                 # visibility timeout for in-flight messages

    # ── Error handling ──────────────────────────────────────────────────────
    delete_message: true                   # delete only on successful ack
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
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
    baseYaml: `input:
  gcp_pubsub:
    # ── Connection (filled in from the form) ────────────────────────────────
    project: \${slot.project}
    subscription: \${slot.subscription}
    credentials_json: \${slot.credentialsJson}

    # ── Streaming tuning ────────────────────────────────────────────────────
    sync: false                            # false = streaming pull (recommended)
    max_outstanding_messages: 1000         # in-flight cap per subscription
    max_outstanding_bytes: 1000000000      # 1 GiB outstanding-byte cap
    # endpoint: ""                         # for emulator or regional endpoints
    # create_subscription:
    #   enabled: false
    #   topic: ""

    # ── Error handling ──────────────────────────────────────────────────────
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${slot.targetTopic}

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  // ─────────── Redpanda to analytics & lakehouse ───────────
  {
    id: 'redpanda-to-snowflake',
    name: 'Redpanda to Snowflake',
    description: 'Stream records from a Redpanda topic into a Snowflake table via Snowpipe Streaming.',
    category: 'analytics',
    source: { component: 'redpanda', type: 'input' },
    sink: { component: 'snowflake_streaming', type: 'output' },
    setupTimeMinutes: 10,
    defaultPipelineName: 'redpanda-to-snowflake',
    slots: [
      sourceTopicSlot,
      consumerGroupSlot,
      {
        id: 'account',
        section: 'sink',
        kind: 'string',
        label: 'Snowflake account',
        placeholder: 'xy12345.us-east-1',
        required: true,
        schemaField: 'account',
      },
      {
        id: 'user',
        section: 'sink',
        kind: 'string',
        label: 'Snowflake user',
        required: true,
        schemaField: 'user',
      },
      dsnSlot('privateKey', 'Snowflake RSA private key', 'SNOWFLAKE_PRIVATE_KEY', 'private_key'),
      {
        id: 'database',
        section: 'sink',
        kind: 'string',
        label: 'Database',
        required: true,
        schemaField: 'database',
      },
      {
        id: 'schema',
        section: 'sink',
        kind: 'string',
        label: 'Schema',
        required: true,
        schemaField: 'schema',
      },
      {
        id: 'table',
        section: 'sink',
        kind: 'string',
        label: 'Table',
        required: true,
        schemaField: 'table',
      },
    ],
    baseYaml: `input:
  redpanda:
    # ── Source (filled in from the form) ────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics:
      - \${slot.sourceTopic}
    consumer_group: \${slot.consumerGroup}

    # ── Read behavior ───────────────────────────────────────────────────────
    start_from_oldest: true                # backfill the topic on first run
    auto_replay_nacks: true                # re-deliver NACKed messages
    # commit_period: 5s                    # how often to commit offsets

output:
  snowflake_streaming:
    # ── Connection (filled in from the form) ────────────────────────────────
    account: \${slot.account}
    user: \${slot.user}
    private_key: \${slot.privateKey}
    database: \${slot.database}
    schema: \${slot.schema}
    table: \${slot.table}

    # ── Throughput defaults — Snowpipe Streaming likes larger batches ───────
    batching:
      count: 1000
      period: 5s
    # max_in_flight: 4                     # parallel insert channels
    # init_statement: ""                   # optional setup SQL run once

    # ── Schema handling ─────────────────────────────────────────────────────
    # schema_evolution:
    #   enabled: true                      # auto-add columns from incoming records
    # mapping: ""                          # bloblang to reshape records before insert
`,
  },

  {
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
        // Connector falls back to the project encoded in the service-account
        // credentials or the GOOGLE_CLOUD_PROJECT env var. Most templated runs
        // have the project in the credentials JSON, so we let users leave it
        // blank rather than block on schema-inferred required.
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
      dsnSlot('credentialsJson', 'GCP service-account JSON', 'GCP_SERVICE_ACCOUNT_JSON', 'credentials_json'),
    ],
    baseYaml: `input:
  redpanda:
    # ── Source (filled in from the form) ────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics:
      - \${slot.sourceTopic}
    consumer_group: \${slot.consumerGroup}

    # ── Read behavior ───────────────────────────────────────────────────────
    start_from_oldest: true                # backfill the topic on first run
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  gcp_bigquery:
    # ── Connection (filled in from the form) ────────────────────────────────
    project: \${slot.project}
    dataset: \${slot.dataset}
    table: \${slot.table}
    credentials_json: \${slot.credentialsJson}

    # ── Format & schema ─────────────────────────────────────────────────────
    format: NEWLINE_DELIMITED_JSON         # NEWLINE_DELIMITED_JSON | CSV | AVRO | PARQUET
    # write_disposition: WRITE_APPEND      # WRITE_APPEND | WRITE_TRUNCATE | WRITE_EMPTY
    # create_disposition: CREATE_IF_NEEDED # auto-create the table if missing
    # auto_detect: false                   # schema auto-detect on load
    # csv:
    #   header: ""
    #   field_delimiter: ","

    # ── Throughput defaults — BigQuery loads do best with medium batches ────
    batching:
      count: 500
      period: 5s
    # max_in_flight: 4
`,
  },

  {
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
        label: 'Iceberg catalog URI',
        placeholder: 'https://glue.us-east-1.amazonaws.com',
        required: true,
        schemaField: 'catalog_uri',
      },
      {
        id: 'warehouse',
        section: 'sink',
        kind: 'string',
        label: 'Warehouse location',
        placeholder: 's3://my-bucket/warehouse',
        required: true,
        schemaField: 'warehouse',
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
    ],
    baseYaml: `input:
  redpanda:
    # ── Source (filled in from the form) ────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics:
      - \${slot.sourceTopic}
    consumer_group: \${slot.consumerGroup}

    # ── Read behavior ───────────────────────────────────────────────────────
    start_from_oldest: true                # backfill the topic on first run
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  iceberg:
    # ── Catalog (filled in from the form) ───────────────────────────────────
    catalog_uri: \${slot.catalogUri}
    warehouse: \${slot.warehouse}
    namespace: \${slot.namespace}
    table: \${slot.tableName}

    # ── Write tuning — Iceberg is happiest with sizable batches ─────────────
    batching:
      count: 1000
      period: 10s
    # write_mode: append                   # append | overwrite
    # partition_spec: ""                   # e.g. 'days(event_time)'

    # ── Schema handling ─────────────────────────────────────────────────────
    # schema_evolution:
    #   enabled: true                      # auto-add columns from incoming records
    # mapping: ""                          # bloblang to reshape records before write
`,
  },

  {
    id: 'redpanda-to-postgres',
    name: 'Redpanda to Postgres',
    description: 'Write records from a Redpanda topic into a Postgres table.',
    category: 'analytics',
    source: { component: 'redpanda', type: 'input' },
    sink: { component: 'sql_raw', logoOverride: 'postgres_cdc', type: 'output' },
    setupTimeMinutes: 6,
    defaultPipelineName: 'redpanda-to-postgres',
    slots: [
      sourceTopicSlot,
      consumerGroupSlot,
      dsnSlot('dsn', 'Postgres', 'POSTGRES_DSN', 'dsn'),
      {
        id: 'tableName',
        section: 'sink',
        kind: 'string',
        label: 'Target table',
        required: true,
      },
    ],
    baseYaml: `input:
  redpanda:
    # ── Source (filled in from the form) ────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics:
      - \${slot.sourceTopic}
    consumer_group: \${slot.consumerGroup}

    # ── Read behavior ───────────────────────────────────────────────────────
    start_from_oldest: true                # backfill the topic on first run
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  sql_raw:
    # ── Connection (filled in from the form) ────────────────────────────────
    driver: postgres
    dsn: \${slot.dsn}

    # ── Insert query — adjust columns & mapping for your schema ─────────────
    query: INSERT INTO \${slot.tableName} (payload) VALUES ($1)
    args_mapping: root = [content().string()]

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 200
      period: 1s
    # max_in_flight: 1                     # >1 risks out-of-order writes on conflicts
`,
  },

  // ─────────── Migration & replication ───────────
  {
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
      // SASL fields live under sasl[].{username,password}; the dotted-path resolver
      // can't express array indexing, so we don't bind these to the schema. The
      // hand-curated DSN slot copy stands on its own.
      dsnSlot('sourceUser', 'Source SASL user', 'SOURCE_KAFKA_USER'),
      dsnSlot('sourcePassword', 'Source SASL password', 'SOURCE_KAFKA_PASSWORD'),
    ],
    baseYaml: `input:
  redpanda_migrator:
    # ── Source cluster (filled in from the form) ────────────────────────────
    seed_brokers:
      - \${slot.sourceBrokers}
    topics:
      - \${slot.sourceTopicsRegex}
    regexp_topics: true
    consumer_group: redpanda-migrator

    # ── Auth ────────────────────────────────────────────────────────────────
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${slot.sourceUser}
        password: \${slot.sourcePassword}
    tls:
      enabled: true                        # set false only for unencrypted source clusters

    # ── Migration tuning ────────────────────────────────────────────────────
    start_from_oldest: true                # replicate the full topic history
    # replication_factor_override: true    # apply destination cluster's RF on create
    # replication_factor: -1               # -1 = preserve source RF
    auto_replay_nacks: true

output:
  redpanda:
    # ── Destination cluster ─────────────────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${! @kafka_topic }             # preserve source topic name
    key: \${! @kafka_key }                 # preserve source partition key

    # ── Throughput defaults — large batches help replication catch up ───────
    batching:
      count: 1000
      period: 1s
    max_in_flight: 64
    compression: snappy
    idempotent_write: true
`,
  },

  {
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
    baseYaml: `input:
  redpanda:
    # ── Source (filled in from the form) ────────────────────────────────────
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics:
      - \${slot.sourceTopic}
    consumer_group: \${slot.consumerGroup}

    # ── Read behavior ───────────────────────────────────────────────────────
    start_from_oldest: true                # mirror the full topic history
    auto_replay_nacks: true                # re-deliver NACKed messages

output:
  redpanda_migrator:
    # ── Destination cluster (filled in from the form) ───────────────────────
    seed_brokers:
      - \${slot.destBrokers}
    topic: \${slot.destTopic}

    # ── Auth ────────────────────────────────────────────────────────────────
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${slot.destUser}
        password: \${slot.destPassword}
    tls:
      enabled: true                        # set false only for unencrypted destinations

    # ── Throughput defaults — tune for your workload ────────────────────────
    batching:
      count: 500
      period: 1s
    max_in_flight: 64
    compression: snappy
    # key: \${! @kafka_key }               # preserve source key for partitioning
`,
  },
];

export const getTemplateById = (id: string): PipelineTemplate | undefined =>
  PIPELINE_TEMPLATES.find((t) => t.id === id);
