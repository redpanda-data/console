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

const heavyBranching = `# Heavy branching & routing — stress-tests the visualizer's container/edge model:
# broker fan-in input; nested switch -> branch -> try/catch; for_each + parallel;
# resource references (cache + rate limit); switch output with DLQ + fallback tiers.
input:
  broker:
    inputs:
      - redpanda:
          seed_brokers:
            - \${REDPANDA_BROKERS}
          topics: [orders, payments]
          consumer_group: routing-demo
          sasl:
            - mechanism: SCRAM-SHA-256
              username: \${secrets.KAFKA_USER}
              password: \${secrets.KAFKA_PASSWORD}
          tls:
            enabled: true
      - generate:
          interval: 5s
          mapping: 'root = {"synthetic": true, "region": "us"}'

pipeline:
  threads: 4
  processors:
    - cache:
        resource: dedupe_cache
        operator: add
        key: \${! json("order_id") }
        value: "1"
    - mapping: 'root = if errored() { deleted() } else { this }'
    - switch:
        - check: this.region == "us"
          processors:
            - branch:
                request_map: 'root = this.customer_id'
                processors:
                  - http:
                      url: https://us.api/customers
                      verb: GET
                      retries: 3
                result_map: 'root.customer = this'
            - rate_limit:
                resource: us_limiter
        - check: this.region == "eu"
          processors:
            - branch:
                request_map: 'root = this.customer_id'
                processors:
                  - try:
                      - http:
                          url: https://eu.api/customers
                      - cache:
                          resource: customer_cache
                          operator: set
                          key: \${! json("id") }
                          value: \${! content() }
                  - catch:
                      - log:
                          level: WARN
                          message: 'EU customer lookup failed'
                      - mapping: 'root.customer = {"fallback": true}'
                result_map: 'root.customer = this'
        - processors:
            - mapping: 'root.region = "unknown"'
    - for_each:
        - mapping: 'root = this'
    - parallel:
        cap: 3
        processors:
          - http:
              url: https://enrich.geo
          - http:
              url: https://enrich.risk
    - branch:
        request_map: 'root = this'
        processors:
          - aws_lambda:
              function: fraud-score
              region: us-east-1
        result_map: 'root.fraud = this'

output:
  switch:
    cases:
      - check: errored()
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: orders-dlq
            sasl:
              - mechanism: SCRAM-SHA-256
                username: \${secrets.KAFKA_USER}
                password: \${secrets.KAFKA_PASSWORD}
            tls:
              enabled: true
      - check: this.fraud.score > 0.9
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: orders-review
      - check: this.region == "us"
        output:
          aws_s3:
            bucket: us-orders-prod
            path: orders/\${! timestamp_unix() }-\${! uuid_v4() }.json
      - output:
          fallback:
            - gcp_pubsub:
                project: my-project
                topic: orders-stream
            - redpanda:
                seed_brokers:
                  - \${REDPANDA_BROKERS}
                topic: orders-fallback

cache_resources:
  - label: dedupe_cache
    redis:
      url: redis://cache:6379
      prefix: "dedupe:"
  - label: customer_cache
    memcached:
      addresses:
        - memcached:11211
      default_ttl: 5m

rate_limit_resources:
  - label: us_limiter
    local:
      count: 1000
      interval: 1s
`;

const resourceIndirection = `# Resource indirection — the input, output, and a processor are declared as named
# *_resources entries and referenced by label with \`resource:\`. The HTTP enrichment
# processor is defined ONCE and reused in two places (the main path and the catch
# handler), so editing it updates both. Valid in Redpanda Cloud.
# See: https://docs.redpanda.com/redpanda-cloud/develop/connect/configuration/resources/
input:
  resource: orders_in

pipeline:
  processors:
    - resource: enrich_http
    - catch:
        - resource: enrich_http
        - log:
            level: WARN
            message: 'enrichment retry failed: \${! error() }'

output:
  resource: orders_out

input_resources:
  - label: orders_in
    redpanda:
      seed_brokers:
        - \${REDPANDA_BROKERS}
      topics: [orders]
      consumer_group: connect-resource-demo
      sasl:
        - mechanism: SCRAM-SHA-256
          username: \${secrets.KAFKA_USER}
          password: \${secrets.KAFKA_PASSWORD}
      tls:
        enabled: true

processor_resources:
  - label: enrich_http
    http:
      url: https://internal.api/enrich
      verb: POST
      timeout: 2s
      retries: 3

output_resources:
  - label: orders_out
    redpanda:
      seed_brokers:
        - \${REDPANDA_BROKERS}
      topic: orders-enriched
      sasl:
        - mechanism: SCRAM-SHA-256
          username: \${secrets.KAFKA_USER}
          password: \${secrets.KAFKA_PASSWORD}
      tls:
        enabled: true
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

const omniChannelPlatform = `# Omni-channel commerce event platform — a deliberately MASSIVE, maximally-branched pipeline.
# Five sources fan into one broker; a top-level switch routes each event by type (order /
# payment / clickstream / inventory / shipment / heartbeat / audit) into its own deeply nested
# sub-pipeline (switch -> branch -> try/catch -> parallel -> workflow DAG -> for_each -> group_by).
# After type routing, every event runs shared cross-cutting stages: fraud scoring (lambda),
# parallel 360 enrichment, an audited side-effect write with try/catch, and a final routing
# decision. A large switch output then fans results to DLQ, review, per-region S3, pub/sub and
# layered fallbacks. Cache + rate-limit resources are referenced by label throughout. Built to
# exercise every node/edge shape in the visualizer — not all components validate in Cloud.
input:
  broker:
    inputs:
      - redpanda:
          seed_brokers:
            - \${REDPANDA_BROKERS}
          topics: [orders]
          consumer_group: omni-orders
          sasl:
            - mechanism: SCRAM-SHA-256
              username: \${secrets.KAFKA_USER}
              password: \${secrets.KAFKA_PASSWORD}
          tls:
            enabled: true
      - redpanda:
          seed_brokers:
            - \${REDPANDA_BROKERS}
          topics: [payments]
          consumer_group: omni-payments
          sasl:
            - mechanism: SCRAM-SHA-256
              username: \${secrets.KAFKA_USER}
              password: \${secrets.KAFKA_PASSWORD}
          tls:
            enabled: true
      - redpanda:
          seed_brokers:
            - \${REDPANDA_BROKERS}
          topics: [clickstream]
          consumer_group: omni-clicks
          sasl:
            - mechanism: SCRAM-SHA-256
              username: \${secrets.KAFKA_USER}
              password: \${secrets.KAFKA_PASSWORD}
          tls:
            enabled: true
      - http_server:
          path: /ingest/webhooks
          rate_limit: ingest_limiter
      - generate:
          interval: 30s
          mapping: |
            root = {
              "event_type": "heartbeat",
              "event_id": uuid_v4(),
              "ts": now(),
              "source": "synthetic"
            }
    batching:
      count: 100
      period: 1s
      processors:
        - mapping: 'root = this'

pipeline:
  threads: 8
  processors:
    # 1. Drop duplicates by idempotency key (add returns an error on a repeat -> deleted below).
    - cache:
        resource: dedupe_cache
        operator: add
        key: \${! json("event_id") }
        value: "1"
    - mapping: 'root = if errored() { deleted() } else { this }'
    # 2. Normalize the envelope so every downstream branch can assume the same shape.
    - mapping: |
        root = this
        root.event_id = this.event_id | uuid_v4()
        root.event_type = (this.event_type | "unknown").lowercase()
        root.region = this.region | "us"
        root.received_at = now()
        meta ingest_source = this.source | "kafka"
    # 3. Redact PII up front — hash the email, keep only the last 4 of the phone.
    - mapping: |
        root = this
        root.customer.email = (this.customer.email | "").hash("sha256").encode("hex")
        root.customer.phone = if this.customer.phone != null {
          "***-***-" + this.customer.phone.slice(-4)
        }
    # 4. TOP-LEVEL ROUTING — one deep branch per event type.
    - switch:
        # ---- ORDER ----
        - check: this.event_type == "order"
          processors:
            - mapping: 'root.pipeline = "order"'
            - log:
                level: DEBUG
                message: 'routing order \${! json("event_id") }'
            - switch:
                - check: this.order.channel == "web"
                  processors:
                    - branch:
                        request_map: 'root = {"customer_id": this.customer.id, "cart": this.order.cart}'
                        processors:
                          - try:
                              - http:
                                  url: https://catalog.internal/price
                                  verb: POST
                                  headers:
                                    Content-Type: application/json
                                    Authorization: 'Bearer \${secrets.CATALOG_TOKEN}'
                                  retries: 3
                                  timeout: 5s
                              - cache:
                                  resource: price_cache
                                  operator: set
                                  key: \${! json("customer_id") }
                                  value: \${! content() }
                          - catch:
                              - log:
                                  level: ERROR
                                  message: 'price lookup failed, falling back to cache'
                              - cache:
                                  resource: price_cache
                                  operator: get
                                  key: \${! json("customer_id") }
                        result_map: 'root.order.pricing = this'
                    - parallel:
                        cap: 3
                        processors:
                          - http:
                              url: https://loyalty.internal/points
                              verb: GET
                          - http:
                              url: https://tax.internal/estimate
                              verb: POST
                          - http:
                              url: https://promo.internal/apply
                              verb: POST
                - check: this.order.channel == "mobile"
                  processors:
                    - branch:
                        request_map: 'root = this.order'
                        processors:
                          - switch:
                              - check: this.total > 500
                                processors:
                                  - rate_limit:
                                      resource: high_value_limiter
                                  - aws_lambda:
                                      function: high-value-review
                                      region: us-east-1
                              - processors:
                                  - mapping: 'root.auto_approved = true'
                        result_map: 'root.order.review = this'
                - check: this.order.channel == "store"
                  processors:
                    - for_each:
                        - mapping: 'root = this'
                        - cache:
                            resource: inventory_cache
                            operator: add
                            key: \${! json("sku") }
                            value: \${! json("qty") }
                - processors:
                    - mapping: 'root.order.channel = "unknown"'
                    - log:
                        level: WARN
                        message: 'order with unknown channel'
        # ---- PAYMENT ----
        - check: this.event_type == "payment"
          processors:
            - mapping: 'root.pipeline = "payment"'
            - switch:
                - check: this.payment.method == "card"
                  processors:
                    - try:
                        - branch:
                            request_map: 'root = {"pan": this.payment.card.token, "amount": this.payment.amount}'
                            processors:
                              - rate_limit:
                                  resource: psp_limiter
                              - http:
                                  url: https://psp.internal/authorize
                                  verb: POST
                                  retries: 2
                                  timeout: 8s
                            result_map: 'root.payment.auth = this'
                        - mapping: 'root.payment.status = this.payment.auth.status'
                    - catch:
                        - mapping: 'root.payment.status = "auth_error"'
                        - log:
                            level: ERROR
                            message: 'card authorization failed'
                - check: this.payment.method == "wallet"
                  processors:
                    - branch:
                        request_map: 'root = this.payment.wallet'
                        processors:
                          - http:
                              url: https://wallet.internal/charge
                              verb: POST
                        result_map: 'root.payment.wallet_result = this'
                - check: this.payment.method == "bank_transfer"
                  processors:
                    - workflow:
                        meta_path: meta.bank_workflow
                        order:
                          - [verify_account]
                          - [check_balance, aml_screen]
                          - [settle]
                        branches:
                          verify_account:
                            request_map: 'root = this.payment.bank'
                            processors:
                              - http:
                                  url: https://bank.internal/verify
                            result_map: 'root.verified = this.ok'
                          check_balance:
                            request_map: 'root = this.payment.bank'
                            processors:
                              - http:
                                  url: https://bank.internal/balance
                            result_map: 'root.balance = this.amount'
                          aml_screen:
                            request_map: 'root = {"name": this.customer.name}'
                            processors:
                              - aws_lambda:
                                  function: aml-screen
                                  region: us-east-1
                            result_map: 'root.aml_flag = this.flag'
                          settle:
                            request_map: 'root = this.payment'
                            processors:
                              - http:
                                  url: https://bank.internal/settle
                                  verb: POST
                            result_map: 'root.settlement = this'
                - processors:
                    - mapping: 'root.payment.method = "other"'
        # ---- CLICKSTREAM ----
        - check: this.event_type == "clickstream"
          processors:
            - mapping: 'root.pipeline = "clickstream"'
            - group_by_value:
                value: \${! json("session_id") }
            - for_each:
                - mapping: |
                    root = this
                    root.dwell_ms = this.exit_ts - this.enter_ts
                - switch:
                    - check: this.dwell_ms > 30000
                      processors:
                        - cache:
                            resource: engaged_cache
                            operator: set
                            key: \${! json("session_id") }
                            value: "1"
                        - branch:
                            request_map: 'root = {"session": this.session_id, "path": this.page_path}'
                            processors:
                              - http:
                                  url: https://recs.internal/next-best
                                  verb: POST
                            result_map: 'root.recommendation = this'
                    - processors:
                        - mapping: 'root.engaged = false'
        # ---- INVENTORY (workflow DAG) ----
        - check: this.event_type == "inventory"
          processors:
            - mapping: 'root.pipeline = "inventory"'
            - workflow:
                meta_path: meta.inventory_workflow
                order:
                  - [reserve]
                  - [reprice, restock_alert]
                  - [publish_delta]
                branches:
                  reserve:
                    request_map: 'root = {"sku": this.sku, "qty": this.qty}'
                    processors:
                      - cache:
                          resource: inventory_cache
                          operator: add
                          key: \${! json("sku") }
                          value: \${! json("qty") }
                    result_map: 'root.reserved = true'
                  reprice:
                    request_map: 'root = {"sku": this.sku}'
                    processors:
                      - branch:
                          request_map: 'root = this'
                          processors:
                            - http:
                                url: https://pricing.internal/reprice
                                verb: POST
                          result_map: 'root.new_price = this.price'
                    result_map: 'root.reprice = this'
                  restock_alert:
                    request_map: 'root = {"sku": this.sku, "on_hand": this.on_hand}'
                    processors:
                      - switch:
                          - check: this.on_hand < 10
                            processors:
                              - http:
                                  url: https://alerts.internal/restock
                                  verb: POST
                          - processors:
                              - mapping: 'root = deleted()'
                    result_map: 'root.alerted = this != null'
                  publish_delta:
                    request_map: 'root = this'
                    processors:
                      - mapping: 'root.delta_published = true'
                    result_map: 'root.published = this'
        # ---- SHIPMENT ----
        - check: this.event_type == "shipment"
          processors:
            - mapping: 'root.pipeline = "shipment"'
            - branch:
                request_map: 'root = this.shipment'
                processors:
                  - switch:
                      - check: this.carrier == "express"
                        processors:
                          - try:
                              - http:
                                  url: https://express.carrier/track
                          - catch:
                              - log:
                                  level: WARN
                                  message: 'express tracking unavailable'
                              - mapping: 'root.tracking = "unavailable"'
                      - processors:
                          - http:
                              url: https://standard.carrier/track
                result_map: 'root.shipment.tracking = this'
        # ---- REFUND ----
        - check: this.event_type == "refund"
          processors:
            - mapping: 'root.pipeline = "refund"'
            - switch:
                - check: this.refund.reason == "fraud"
                  processors:
                    - branch:
                        request_map: 'root = {"order_id": this.refund.order_id}'
                        processors:
                          - aws_lambda:
                              function: fraud-clawback
                              region: us-east-1
                        result_map: 'root.refund.clawback = this'
                    - log:
                        level: WARN
                        message: 'fraud refund \${! json("refund.order_id") }'
                - check: this.refund.amount > 1000
                  processors:
                    - workflow:
                        meta_path: meta.refund_approval
                        order:
                          - [manager_approve]
                          - [finance_approve]
                          - [reverse_charge]
                        branches:
                          manager_approve:
                            request_map: 'root = this.refund'
                            processors:
                              - http:
                                  url: https://approvals.internal/manager
                                  verb: POST
                                  retries: 2
                            result_map: 'root.manager_ok = this.approved'
                          finance_approve:
                            request_map: 'root = this.refund'
                            processors:
                              - http:
                                  url: https://approvals.internal/finance
                                  verb: POST
                            result_map: 'root.finance_ok = this.approved'
                          reverse_charge:
                            request_map: 'root = {"charge_id": this.refund.charge_id}'
                            processors:
                              - try:
                                  - http:
                                      url: https://psp.internal/reverse
                                      verb: POST
                              - catch:
                                  - log:
                                      level: ERROR
                                      message: 'charge reversal failed'
                                  - mapping: 'root.reversal_status = "manual_review"'
                            result_map: 'root.reversal = this'
                - processors:
                    - rate_limit:
                        resource: refund_limiter
                    - branch:
                        request_map: 'root = {"charge_id": this.refund.charge_id}'
                        processors:
                          - http:
                              url: https://psp.internal/refund
                              verb: POST
                        result_map: 'root.refund.result = this'
        # ---- SUBSCRIPTION ----
        - check: this.event_type == "subscription"
          processors:
            - mapping: 'root.pipeline = "subscription"'
            - switch:
                - check: this.subscription.action == "create"
                  processors:
                    - parallel:
                        cap: 2
                        processors:
                          - branch:
                              request_map: 'root = this.customer'
                              processors:
                                - http:
                                    url: https://billing.internal/subscribe
                                    verb: POST
                              result_map: 'root.billing = this'
                          - http:
                              url: https://email.internal/welcome
                              verb: POST
                - check: this.subscription.action == "renew"
                  processors:
                    - try:
                        - branch:
                            request_map: 'root = {"sub_id": this.subscription.id}'
                            processors:
                              - rate_limit:
                                  resource: psp_limiter
                              - http:
                                  url: https://billing.internal/charge
                                  verb: POST
                                  retries: 3
                            result_map: 'root.subscription.charge = this'
                        - mapping: 'root.subscription.status = "active"'
                    - catch:
                        - mapping: 'root.subscription.status = "past_due"'
                        - branch:
                            request_map: 'root = this.customer'
                            processors:
                              - http:
                                  url: https://email.internal/dunning
                                  verb: POST
                            result_map: 'root.dunning = this'
                - check: this.subscription.action == "cancel"
                  processors:
                    - branch:
                        request_map: 'root = {"sub_id": this.subscription.id}'
                        processors:
                          - http:
                              url: https://billing.internal/cancel
                              verb: POST
                        result_map: 'root.subscription.cancelled = this.ok'
                    - switch:
                        - check: this.subscription.reason == "too_expensive"
                          processors:
                            - branch:
                                request_map: 'root = this.customer'
                                processors:
                                  - http:
                                      url: https://retention.internal/offer
                                      verb: POST
                                result_map: 'root.win_back = this'
                        - processors:
                            - mapping: 'root.win_back = null'
                - processors:
                    - mapping: 'root.subscription.action = "noop"'
        # ---- REVIEW ----
        - check: this.event_type == "review"
          processors:
            - mapping: 'root.pipeline = "review"'
            - branch:
                request_map: 'root = {"text": this.review.body}'
                processors:
                  - aws_lambda:
                      function: sentiment-score
                      region: us-east-1
                result_map: 'root.review.sentiment = this.score'
            - switch:
                - check: this.review.sentiment < 0.2
                  processors:
                    - cache:
                        resource: audit_cache
                        operator: set
                        key: \${! json("review.id") }
                        value: "negative"
                    - branch:
                        request_map: 'root = this.review'
                        processors:
                          - http:
                              url: https://support.internal/escalate
                              verb: POST
                        result_map: 'root.escalation = this'
                - check: this.review.rating >= 4
                  processors:
                    - mapping: 'root.review.featured = true'
                - processors:
                    - mapping: 'root.review.featured = false'
        # ---- FULFILLMENT (workflow DAG) ----
        - check: this.event_type == "fulfillment"
          processors:
            - mapping: 'root.pipeline = "fulfillment"'
            - workflow:
                meta_path: meta.fulfillment
                order:
                  - [allocate]
                  - [pick, pack]
                  - [label, notify]
                branches:
                  allocate:
                    request_map: 'root = {"order_id": this.fulfillment.order_id}'
                    processors:
                      - cache:
                          resource: inventory_cache
                          operator: get
                          key: \${! json("order_id") }
                    result_map: 'root.warehouse = this.warehouse'
                  pick:
                    request_map: 'root = this.fulfillment'
                    processors:
                      - for_each:
                          - mapping: 'root = this'
                    result_map: 'root.picked = true'
                  pack:
                    request_map: 'root = this.fulfillment'
                    processors:
                      - http:
                          url: https://wms.internal/pack
                          verb: POST
                    result_map: 'root.packed = this.ok'
                  label:
                    request_map: 'root = {"carrier": this.shipment.carrier}'
                    processors:
                      - try:
                          - http:
                              url: https://carrier.internal/label
                              verb: POST
                          - catch:
                              - log:
                                  level: ERROR
                                  message: 'label generation failed'
                    result_map: 'root.label = this'
                  notify:
                    request_map: 'root = this.customer'
                    processors:
                      - http:
                          url: https://email.internal/shipped
                          verb: POST
                    result_map: 'root.notified = this.ok'
        # ---- HEARTBEAT ----
        - check: this.event_type == "heartbeat"
          processors:
            - log:
                level: INFO
                message: 'heartbeat from \${! meta("ingest_source") }'
            - mapping: 'root = deleted()'
        # ---- DEFAULT / AUDIT ----
        - processors:
            - log:
                level: WARN
                message: 'unclassified event \${! json("event_type") }'
            - mapping: 'root.pipeline = "audit"'
    # 5. CROSS-CUTTING — runs for every surviving event regardless of type.
    # 5a. Fraud scoring via Lambda.
    - branch:
        request_map: |
          root.amount = this.order.total | this.payment.amount | 0
          root.region = this.region
          root.customer_id = this.customer.id
        processors:
          - aws_lambda:
              function: fraud-score
              region: us-east-1
        result_map: 'root.fraud = this'
    # 5b. Parallel 360-degree enrichment.
    - parallel:
        cap: 4
        processors:
          - http:
              url: https://enrich.internal/geo
          - http:
              url: https://enrich.internal/device
          - http:
              url: https://enrich.internal/customer360
          - branch:
              request_map: 'root = this.customer.id'
              processors:
                - cache:
                    resource: customer_cache
                    operator: get
                    key: \${! content() }
              result_map: 'root.customer.profile = this.catch(this)'
    # 5c. Per-line-item normalization.
    - for_each:
        - mapping: 'root = this'
    # 5d. Audited side-effect write (best-effort).
    - try:
        - mapping: 'root.enriched_at = now()'
        - cache:
            resource: audit_cache
            operator: set
            key: \${! json("event_id") }
            value: \${! content() }
    - catch:
        - log:
            level: ERROR
            message: 'audit write failed for \${! json("event_id") }'
    # 5e. Final routing decision consumed by the output switch.
    - mapping: |
        root = this
        root.route = match {
          this.fraud.score > 0.9 => "block",
          this.region == "eu" => "eu",
          this.region == "apac" => "apac",
          _ => "us"
        }

output:
  switch:
    cases:
      - check: errored() || this.route == "block"
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: events-dlq
            sasl:
              - mechanism: SCRAM-SHA-256
                username: \${secrets.KAFKA_USER}
                password: \${secrets.KAFKA_PASSWORD}
            tls:
              enabled: true
      - check: this.pipeline == "payment" && this.payment.status == "auth_error"
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: payments-review
      - check: this.route == "eu"
        output:
          aws_s3:
            bucket: eu-events-prod
            region: eu-west-1
            path: events/\${! timestamp_unix() }-\${! uuid_v4() }.json
      - check: this.route == "apac"
        output:
          broker:
            pattern: fan_out
            outputs:
              - gcp_pubsub:
                  project: apac-project
                  topic: events-stream
              - aws_s3:
                  bucket: apac-events-prod
                  region: ap-southeast-1
                  path: events/\${! timestamp_unix() }.json
      - check: this.pipeline == "clickstream"
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: clickstream-enriched
      - check: this.pipeline == "refund"
        output:
          broker:
            pattern: fan_out
            outputs:
              - redpanda:
                  seed_brokers:
                    - \${REDPANDA_BROKERS}
                  topic: refunds-ledger
              - aws_s3:
                  bucket: finance-audit
                  region: us-east-1
                  path: refunds/\${! timestamp_unix() }-\${! uuid_v4() }.json
      - check: this.pipeline == "subscription"
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: subscription-events
      - check: this.pipeline == "review" && this.review.featured
        output:
          gcp_pubsub:
            project: cx-project
            topic: featured-reviews
      - check: this.pipeline == "fulfillment"
        output:
          redpanda:
            seed_brokers:
              - \${REDPANDA_BROKERS}
            topic: fulfillment-updates
      - output:
          fallback:
            - redpanda:
                seed_brokers:
                  - \${REDPANDA_BROKERS}
                topic: events-main
                sasl:
                  - mechanism: SCRAM-SHA-256
                    username: \${secrets.KAFKA_USER}
                    password: \${secrets.KAFKA_PASSWORD}
                tls:
                  enabled: true
            - aws_s3:
                bucket: events-cold-storage
                region: us-east-1
                path: events/\${! timestamp_unix() }-\${! uuid_v4() }.json
            - drop: {}

cache_resources:
  - label: dedupe_cache
    redis:
      url: redis://cache:6379
      prefix: "dedupe:"
  - label: price_cache
    memcached:
      addresses:
        - memcached:11211
      default_ttl: 10m
  - label: inventory_cache
    redis:
      url: redis://inventory:6379
      prefix: "inv:"
  - label: customer_cache
    redis:
      url: redis://customer:6379
      prefix: "cust:"
  - label: engaged_cache
    memory:
      default_ttl: 1h
  - label: audit_cache
    memory:
      default_ttl: 5m

rate_limit_resources:
  - label: ingest_limiter
    local:
      count: 5000
      interval: 1s
  - label: psp_limiter
    local:
      count: 200
      interval: 1s
  - label: high_value_limiter
    local:
      count: 50
      interval: 1s
  - label: refund_limiter
    local:
      count: 100
      interval: 1s
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
    id: 'complex-heavy-branching',
    name: 'Complex — heavy branching & routing',
    description:
      'Broker fan-in, nested switch → branch → try/catch, for_each, parallel, cache/rate-limit refs, switch+fallback DLQ output. Built to exercise the visualizer.',
    yaml: heavyBranching,
    tags: ['complex'],
  },
  {
    id: 'complex-omni-channel-platform',
    name: 'Complex — omni-channel platform (mega)',
    description:
      '~800-line, maximally-branched commerce platform: broker fan-in of 5 sources, top-level switch routing per event type into nested switch/branch/try-catch/parallel/workflow/for_each/group_by, shared fraud + enrichment stages, and a large switch output with DLQ, per-region S3, pub/sub and fallbacks. Exercises every visualizer node/edge shape.',
    yaml: omniChannelPlatform,
    tags: ['complex'],
  },
  {
    id: 'edge-resource-indirection',
    name: 'Edge — resource indirection (*_resources)',
    description:
      'input/output/processor declared as named *_resources and referenced via resource:. Exercises the visualizer’s reference linking and a reused processor resource.',
    yaml: resourceIndirection,
    tags: ['edge-case'],
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
