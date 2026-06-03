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

// Pipeline fixtures use the modern `redpanda` input/output component
// (recommended over the older `kafka_franz` / `kafka` aliases) and follow
// the Cloud Connect quickstart credentials pattern: `${REDPANDA_BROKERS}`
// for the broker contextual variable and `${secrets.X}` for SASL/TLS material.
// See: https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/

export type ConnectConfigFixture = {
  id: string;
  name: string;
  description: string;
  yaml: string;
  tags: ('simple' | 'medium' | 'complex' | 'invalid' | 'edge-case')[];
};

const generateToDrop = `# Smallest valid pipeline that emits visible logs.
# 'log' processor writes one INFO line per message to the pipeline log stream,
# so you'll see activity in the Logs tab even though the output is dropped.
input:
  generate:
    interval: 1s
    mapping: 'root = {"id": uuid_v4(), "ts": now(), "value": random_int()}'

pipeline:
  processors:
    - log:
        level: INFO
        message: 'generated message: \${! content() }'

output:
  drop: {}
`;

const generateToRedpandaLocal = `# cloudv2 local Tilt — needs ONE Console secret created first.
#
# The pipeline-lint allowlist (apps/redpanda-connect-api/config/config.go
# Variables struct) only accepts these env vars without a Console secret:
#   REDPANDA_BROKERS, REDPANDA_TLS_ENABLED, REDPANDA_SCHEMA_REGISTRY_URL,
#   REDPANDA_REGION, REDPANDA_ID, PRIVATE_REDPANDA_*
# REDPANDA_SASL_* are NOT on the allowlist (the deployment exports them
# at runtime, but the linter blocks save first), so SASL must go through
# Console secrets.
#
# One-time setup:
#   1. cloudv2 Tilt creates TWO k3d clusters. The rpcn-sasl Secret lives on
#      the BYOC cluster, not cloudv2-dev. Get its kubeconfig first:
#        k3d kubeconfig get byoc-d7l77j42 > /tmp/byoc-kubeconfig
#
#   2. Get the local Redpanda admin password:
#        KUBECONFIG=/tmp/byoc-kubeconfig kubectl -n redpanda-connect \\
#          get secret rpcn-sasl -o jsonpath='{.data.password}' | base64 -d
#
#   3. In Console UI go to /rp-connect/secrets → Create secret:
#        name:  LOCAL_RP_PASSWORD
#        value: <paste from step 2>
#
#   4. Create the destination topic (Redpanda doesn't auto-create):
#        Console UI → Topics → Create → demo-events (defaults are fine)
#
#   5. Save this pipeline.
#
# Mechanism + username are hardcoded (admin is the local superuser provisioned
# by the Helm chart). Only the password needs to be a secret.
input:
  generate:
    interval: 1s
    mapping: |
      root.id = uuid_v4()
      root.timestamp = now()
      root.value = random_int(min: 0, max: 100)

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: demo-events
    key: \${! json("id") }
    sasl:
      - mechanism: SCRAM-SHA-256
        username: admin
        password: \${secrets.LOCAL_RP_PASSWORD}
`;

const generateToRedpanda = `# Generate synthetic JSON every second and write it to a Redpanda topic
# using SCRAM-SHA-256 + TLS — the canonical Cloud quickstart pattern.
input:
  generate:
    interval: 1s
    mapping: |
      root.id = uuid_v4()
      root.timestamp = now()
      root.value = random_int(min: 0, max: 100)

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: demo-events
    key: \${! json("id") }
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true
`;

const noisyLogs = `# Generates messages at high volume and logs at INFO + WARN + ERROR — for
# testing the Logs tab UI (filtering, search, color coding, scroll behaviour).
#
# NOTE: in Redpanda Cloud Connect the platform forces a fixed log level
# (INFO and above), so 'log' processors at DEBUG or TRACE are silently
# dropped before reaching the UI — and 'logger.level' in user YAML is
# ignored. Stick to INFO/WARN/ERROR for visible output.
input:
  generate:
    interval: 5s
    mapping: |
      root.id = uuid_v4()
      root.user_id = random_int(min: 1, max: 1000)
      root.action = ["login","logout","click","purchase","error"].index(random_int(min: 0, max: 4))

pipeline:
  processors:
    - log:
        level: INFO
        message: 'event processed: \${! content() }'
    - branch:
        request_map: 'root = this'
        processors:
          - mapping: |
              root = if this.action == "error" {
                throw("synthetic error for user " + this.user_id.string())
              } else if this.action == "purchase" {
                throw("warn-level: purchase needs review for user " + this.user_id.string())
              } else { this }
    - catch:
        - log:
            level: WARN
            message: 'WARN caught: \${! error() }'
        - mapping: 'root = deleted()'

output:
  drop: {}
`;

const httpToRedpanda = `# HTTP server -> validate/enrich -> Redpanda. Sources events from a webhook,
# decodes against the Schema Registry, falls back gracefully on schema errors,
# and writes to Redpanda with the event id as the partition key.
input:
  http_server:
    address: "0.0.0.0:4195"
    path: /events
    timeout: 5s

pipeline:
  threads: 4
  processors:
    - mapping: |
        root = this
        root.received_at = now()
        root.source = "http"
    - try:
        - schema_registry_decode:
            url: \${secrets.SCHEMA_REGISTRY_URL}
            basic_auth:
              enabled: true
              username: \${secrets.SCHEMA_REGISTRY_USER}
              password: \${secrets.SCHEMA_REGISTRY_PASSWORD}
        - mapping: 'root.validated = true'
    - catch:
        - log:
            level: WARN
            message: 'schema decode failed: \${! error() }'
        - mapping: 'root.validated = false'

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: events-validated
    key: \${! json("id") }
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true
`;

const postgresCdcToRedpanda = `# Postgres CDC -> Redpanda. Captures row-level changes from Postgres
# via logical replication and forwards them to a Redpanda topic, keyed
# by the table's primary key for in-order partition consumption downstream.
# See: https://docs.redpanda.com/redpanda-connect/components/inputs/postgres_cdc/
input:
  postgres_cdc:
    dsn: \${secrets.POSTGRES_DSN}
    schema: public
    tables:
      - orders
      - order_items
    slot_name: connect_orders_slot
    stream_snapshot: true
    snapshot_batch_size: 10000
    temporary_slot: false
    include_transaction_markers: false

pipeline:
  processors:
    - mapping: |
        # Flatten the CDC envelope and stamp metadata.
        root = this
        root.cdc_timestamp = now()
        meta kafka_key = if this.operation == "delete" {
          this.before.id.string()
        } else {
          this.after.id.string()
        }

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: \${! "cdc." + meta("table") }
    key: \${! meta("kafka_key") }
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true
    partitioner: murmur2_hash
    max_in_flight: 256
    batching:
      count: 100
      period: 1s
`;

const enrichmentWorkflow = `# Multi-branch workflow enrichment — Redpanda -> parallel HTTP enrichments
# (claims + hyperbole, then fake-news scoring depending on both) -> Redpanda.
# Adapted from the official "enrichments" cookbook.
# See: https://docs.redpanda.com/redpanda-connect/cookbooks/enrichments/
input:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: [articles]
    consumer_group: connect-enrichments
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true

pipeline:
  threads: 4
  processors:
    - workflow:
        meta_path: ""
        branches:
          claims:
            request_map: 'root.text = this.article.content'
            processors:
              - http:
                  url: http://claim-svc.internal/claims
                  verb: POST
                  timeout: 2s
                  retries: 3
            result_map: 'root.tmp.claims = this.claims'
          hyperbole:
            request_map: 'root.text = this.article.content'
            processors:
              - http:
                  url: http://hyperbole-svc.internal/score
                  verb: POST
                  timeout: 2s
            result_map: 'root.tmp.hyperbole_rank = this.hyperbole_rank'
          fake_news:
            request_map: |
              root.text = this.article.content
              root.claims = this.tmp.claims
              root.hyperbole_rank = this.tmp.hyperbole_rank
            processors:
              - http:
                  url: http://fake-news-svc.internal/score
                  verb: POST
                  timeout: 5s
            result_map: 'root.article.fake_news_score = this.fake_news_rank'
    - catch:
        - log:
            level: WARN
            message: 'enrichment failed: \${! error() }'
    - mapping: |
        root = this
        root.tmp = deleted()

output:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topic: articles-enriched
    key: \${! json("article.id") }
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true
`;

const ragEmbeddingPipeline = `# RAG ingestion: Redpanda -> chunk + embed -> PGVector.
# Reads documents off a topic, splits them, generates OpenAI embeddings,
# and upserts vectors into Postgres for retrieval-augmented generation.
input:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: [documents-raw]
    consumer_group: connect-rag-ingest
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true

pipeline:
  threads: 4
  processors:
    - mapping: |
        # Split body into ~500-char chunks with overlap.
        root.doc_id = this.id
        root.chunks = this.body.re_find_all_object("(?s).{1,500}")
    - unarchive:
        format: json_array
    - branch:
        request_map: 'root = this.chunks'
        processors:
          - openai_embeddings:
              api_key: \${secrets.OPENAI_API_KEY}
              model: text-embedding-3-small
        result_map: 'root.embedding = this'
    - mapping: |
        root.id = uuid_v4()
        root.doc_id = this.doc_id
        root.text = this.chunks
        root.embedding = this.embedding
        root.created_at = now()

output:
  sql_insert:
    driver: postgres
    dsn: \${secrets.POSTGRES_DSN}
    table: doc_chunks
    columns: ["id", "doc_id", "text", "embedding", "created_at"]
    args_mapping: |
      root = [
        this.id,
        this.doc_id,
        this.text,
        this.embedding,
        this.created_at,
      ]
    batching:
      count: 50
      period: 2s
`;

const enterpriseEnrichment = `# Multi-stage enterprise pipeline:
# Redpanda -> dedupe -> branch enrich (HTTP + Lambda) -> filter -> S3 + DLQ.
input:
  redpanda:
    seed_brokers:
      - \${REDPANDA_BROKERS}
    topics: [raw-events]
    consumer_group: connect-enrichment
    sasl:
      - mechanism: SCRAM-SHA-256
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true

pipeline:
  threads: 8
  processors:
    - cache:
        resource: dedupe_cache
        operator: add
        key: \${! json("event_id") }
        value: "1"
    - mapping: 'root = if errored() { deleted() } else { this }'
    - branch:
        request_map: 'root.user_id = this.user_id'
        processors:
          - http:
              url: https://internal.api/users/\${! json("user_id") }
              verb: GET
              timeout: 2s
              retries: 3
        result_map: 'root.user_profile = this'
    - branch:
        request_map: 'root = this'
        processors:
          - aws_lambda:
              function: enrich-geo
              region: us-east-1
        result_map: 'root.geo = this'
    - mapping: 'root = if this.user_profile.tier == "premium" { this } else { deleted() }'
    - rate_limit:
        resource: downstream_limiter
    - log:
        level: INFO
        message: 'enriched event \${! json("event_id") }'

output:
  switch:
    cases:
      - check: errored()
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: events-dlq
            key: \${! json("event_id") }
            sasl:
              - mechanism: SCRAM-SHA-256
                username: \${secrets.KAFKA_USER}
                password: \${secrets.KAFKA_PASSWORD}
            tls:
              enabled: true
            metadata:
              include_patterns: [".*"]
      - output:
          aws_s3:
            bucket: my-bucket-prod
            path: events/\${! timestamp_unix() }-\${! uuid_v4() }.json
            content_type: application/json
            credentials:
              profile: connect-prod
            batching:
              count: 500
              period: 30s

cache_resources:
  - label: dedupe_cache
    redis:
      url: redis://cache:6379
      prefix: "dedupe:"
      default_ttl: 1h

rate_limit_resources:
  - label: downstream_limiter
    local:
      count: 1000
      interval: 1s
`;

const allComponentsKitchenSink = `# Kitchen sink: many components for stress-testing the editor.
input:
  broker:
    inputs:
      - redpanda:
          seed_brokers:
            - \${REDPANDA_BROKERS}
          topics: [events-primary]
          consumer_group: kitchen-sink
          sasl:
            - mechanism: SCRAM-SHA-256
              username: \${secrets.KAFKA_USER}
              password: \${secrets.KAFKA_PASSWORD}
          tls:
            enabled: true
      - generate:
          interval: 250ms
          mapping: 'root = {"src":"gen-2"}'
      - http_client:
          url: https://api.example.com/feed
          verb: GET
          stream:
            enabled: true
            reconnect: true

pipeline:
  threads: -1
  processors:
    - bloblang: |
        root = this
        root.id = uuid_v4()
        root.ts = now()
    - workflow:
        meta_path: meta.workflow
        order: [[a, b], [c]]
    - parallel:
        cap: 4
        processors:
          - http:
              url: https://enrich.local
    - retry:
        backoff:
          initial_interval: 100ms
          max_interval: 5s
          max_elapsed_time: 30s
        processors:
          - sql_raw:
              driver: postgres
              dsn: \${secrets.POSTGRES_DSN}
              query: "INSERT INTO events VALUES ($1)"
              args_mapping: 'root = [this.id]'
    - group_by_value:
        value: \${! json("type") }
    - archive:
        format: tar
        path: \${! count("files") }.tar
    - compress:
        algorithm: gzip

output:
  broker:
    pattern: fan_out_sequential
    outputs:
      - elasticsearch_v8:
          urls: ["https://es.local:9200"]
          index: events
          id: \${! json("id") }
      - mongodb:
          url: mongodb://mongo
          database: app
          collection: events
          operation: insert-one
      - gcp_pubsub:
          project: my-project
          topic: events-out
      - drop_on:
          error: true
          output:
            redpanda:
              seed_brokers:
                - \${REDPANDA_BROKERS}
              topic: events-archive
              sasl:
                - mechanism: SCRAM-SHA-256
                  username: \${secrets.KAFKA_USER}
                  password: \${secrets.KAFKA_PASSWORD}
              tls:
                enabled: true

tracer:
  open_telemetry_collector:
    address: localhost:4317
    sampling:
      enabled: true
      ratio: 0.1
`;

const malformedYaml = `# Intentionally broken — for testing editor error states.
input:
  redpanda
    seed_brokers: ["localhost:9092"
    topics: events
   consumer_group:    bad-indent

pipeline:
  processors:
    - mapping
        root = this

output:
   stdout: {
`;

const missingRequiredFields = `# Schema-valid YAML but missing required fields — for testing validation.
# A 'redpanda' input needs seed_brokers + (topics OR regexp_topics_include);
# the output needs seed_brokers + topic. Neither is set here.
input:
  redpanda: {}

output:
  redpanda: {}
`;

const stdinStdoutDisabled = `# Uses stdin/stdout — disabled in Cloud Connect for security.
# Should produce: "unable to infer component type: stdout".
# Useful for testing the validation error UI.
input:
  stdin: {}

output:
  stdout: {}
`;

const giantConfig = (() => {
  const procs = Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    return `    - mapping: |
        root = this
        root.step_${n} = "processed"
        root.timestamp_${n} = now()`;
  }).join('\n');
  return `# Large config (~60 processors) — for testing editor performance.
input:
  generate:
    interval: 1s
    mapping: 'root = {"id": uuid_v4()}'

pipeline:
  threads: 1
  processors:
${procs}

output:
  drop: {}
`;
})();

const secretsHeavy = `# Many secret references — for testing the secret-detection UI.
input:
  redpanda:
    seed_brokers:
      - \${secrets.BROKER_1}
      - \${secrets.BROKER_2}
    topics: ["\${secrets.TOPIC_NAME}"]
    consumer_group: connect-secrets-test
    sasl:
      - mechanism: SCRAM-SHA-512
        username: \${secrets.KAFKA_USER}
        password: \${secrets.KAFKA_PASSWORD}
    tls:
      enabled: true
      client_certs:
        - cert: \${secrets.TLS_CERT}
          key: \${secrets.TLS_KEY}

pipeline:
  processors:
    - http:
        url: https://api.example.com
        headers:
          Authorization: "Bearer \${secrets.API_TOKEN}"
          X-Tenant: \${secrets.TENANT_ID}

output:
  aws_s3:
    bucket: \${secrets.S3_BUCKET}
    region: \${secrets.AWS_REGION}
    credentials:
      id: \${secrets.AWS_ACCESS_KEY_ID}
      secret: \${secrets.AWS_SECRET_ACCESS_KEY}
    path: events/\${! timestamp_unix() }.json
`;

export const CONNECT_CONFIG_FIXTURES: ConnectConfigFixture[] = [
  {
    id: 'simple-generate-to-drop',
    name: 'Simple — generate to drop',
    description: 'Smallest pipeline that validates everywhere (Cloud included).',
    yaml: generateToDrop,
    tags: ['simple'],
  },
  {
    id: 'simple-generate-to-redpanda-local',
    name: 'Simple — generate to Redpanda (local Tilt)',
    description: 'cloudv2 Tilt — needs one Console secret (LOCAL_RP_PASSWORD). Setup steps in YAML comments.',
    yaml: generateToRedpandaLocal,
    tags: ['simple'],
  },
  {
    id: 'simple-generate-to-redpanda-cloud',
    name: 'Simple — generate to Redpanda (Cloud)',
    description: 'SCRAM-SHA-256 + TLS using ${secrets.X}. Canonical Cloud quickstart pattern.',
    yaml: generateToRedpanda,
    tags: ['simple'],
  },
  {
    id: 'simple-noisy-logs',
    name: 'Simple — noisy INFO/WARN/ERROR logs',
    description: 'Emits 5 msg/sec at INFO + WARN + ERROR. (DEBUG/TRACE are dropped by Cloud.)',
    yaml: noisyLogs,
    tags: ['simple'],
  },
  {
    id: 'medium-http-to-redpanda',
    name: 'Medium — HTTP to Redpanda',
    description: 'Webhook ingest, schema-registry decode with try/catch, write to Redpanda.',
    yaml: httpToRedpanda,
    tags: ['medium'],
  },
  {
    id: 'medium-postgres-cdc',
    name: 'Medium — Postgres CDC to Redpanda',
    description: 'Logical-replication CDC → Redpanda topic per table, keyed by primary key.',
    yaml: postgresCdcToRedpanda,
    tags: ['medium'],
  },
  {
    id: 'complex-enrichment-workflow',
    name: 'Complex — workflow enrichment',
    description: 'Multi-branch parallel HTTP enrichment (cookbook-style). Redpanda → Redpanda.',
    yaml: enrichmentWorkflow,
    tags: ['complex'],
  },
  {
    id: 'complex-rag-ingest',
    name: 'Complex — RAG ingest (embeddings → PGVector)',
    description: 'Chunk → OpenAI embeddings → Postgres for retrieval-augmented generation.',
    yaml: ragEmbeddingPipeline,
    tags: ['complex'],
  },
  {
    id: 'complex-enterprise',
    name: 'Complex — enterprise enrichment',
    description: 'Redpanda → dedupe → branch enrich → filter → S3 + DLQ. Cache + rate limit resources.',
    yaml: enterpriseEnrichment,
    tags: ['complex'],
  },
  {
    id: 'complex-kitchen-sink',
    name: 'Complex — kitchen sink',
    description: 'Many component types (broker, workflow, parallel, retry, fan_out) for editor stress-testing.',
    yaml: allComponentsKitchenSink,
    tags: ['complex'],
  },
  {
    id: 'edge-secrets-heavy',
    name: 'Edge — many secret references',
    description:
      'Stress-test the ${secrets.X} parser/detector with brokers, SASL, TLS, headers, and S3 creds all interpolated.',
    yaml: secretsHeavy,
    tags: ['edge-case'],
  },
  {
    id: 'edge-giant-config',
    name: 'Edge — 60 processors (perf)',
    description: 'Large pipeline to surface editor/render perf issues.',
    yaml: giantConfig,
    tags: ['edge-case'],
  },
  {
    id: 'invalid-malformed-yaml',
    name: 'Invalid — malformed YAML',
    description: 'Broken syntax for testing editor error display.',
    yaml: malformedYaml,
    tags: ['invalid'],
  },
  {
    id: 'invalid-missing-required',
    name: 'Invalid — missing required fields',
    description: 'Parses, but server-side validation should reject it.',
    yaml: missingRequiredFields,
    tags: ['invalid'],
  },
  {
    id: 'invalid-cloud-disabled-stdio',
    name: 'Invalid — stdin/stdout (Cloud-disabled)',
    description: 'Triggers "unable to infer component type" — components disabled in Cloud.',
    yaml: stdinStdoutDisabled,
    tags: ['invalid'],
  },
];
