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

const generateToKafka = `# Generates synthetic JSON every second and writes to a Kafka topic.
input:
  generate:
    interval: 1s
    mapping: |
      root.id = uuid_v4()
      root.timestamp = now()
      root.value = random_int(min: 0, max: 100)

output:
  kafka_franz:
    seed_brokers: ["localhost:9092"]
    topic: demo-events
    client_id: connect-debug
`;

const noisyLogs = `# Generates messages and logs at multiple levels — for testing the Logs tab UI
# (level filtering, search, color coding, scroll behaviour with high volume).
input:
  generate:
    interval: 200ms
    mapping: |
      root.id = uuid_v4()
      root.level = ["TRACE","DEBUG","INFO","WARN","ERROR"].index(random_int(min: 0, max: 4))
      root.user_id = random_int(min: 1, max: 1000)
      root.action = ["login","logout","click","purchase","error"].index(random_int(min: 0, max: 4))

pipeline:
  processors:
    - log:
        level: TRACE
        message: 'TRACE event \${! json("id") } user=\${! json("user_id") }'
    - log:
        level: DEBUG
        message: 'DEBUG event \${! json("id") } action=\${! json("action") }'
    - log:
        level: INFO
        message: 'INFO event processed: \${! content() }'
    - branch:
        request_map: 'root = this'
        processors:
          - mapping: |
              root = if this.action == "error" {
                throw("synthetic error for user " + this.user_id.string())
              } else { this }
    - catch:
        - log:
            level: ERROR
            message: 'ERROR caught: \${! error() }'
        - mapping: 'root = deleted()'

output:
  drop: {}

logger:
  level: TRACE
  format: logfmt
`;

const stdinStdoutDisabled = `# Uses stdin/stdout — disabled in Cloud Connect for security.
# Should produce: "unable to infer component type: stdout".
# Useful for testing the validation error UI.
input:
  stdin: {}

output:
  stdout: {}
`;

const httpToKafkaWithProcessors = `# HTTP server -> JSON validation/enrichment -> Kafka.
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
            url: http://localhost:8081
        - mapping: |
            root.validated = true
    - catch:
        - log:
            level: WARN
            message: "schema decode failed: \${! error() }"
        - mapping: |
            root.validated = false

output:
  kafka_franz:
    seed_brokers: ["localhost:9092"]
    topic: events-validated
    key: \${! json("id") }
`;

const longComplexEnterprise = `# Multi-stage enterprise pipeline:
# Kafka -> dedupe -> branch (enrich + side-effect) -> filter -> S3 + Kafka DLQ.
input:
  kafka_franz:
    seed_brokers: ["broker-0:9092", "broker-1:9092", "broker-2:9092"]
    topics: ["raw-events"]
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
    - mapping: |
        root = if errored() { deleted() } else { this }
    - branch:
        request_map: |
          root.user_id = this.user_id
        processors:
          - http:
              url: https://internal.api/users/\${! json("user_id") }
              verb: GET
              timeout: 2s
              retries: 3
        result_map: |
          root.user_profile = this
    - branch:
        request_map: |
          root = this
        processors:
          - aws_lambda:
              function: enrich-geo
              region: us-east-1
        result_map: |
          root.geo = this
    - mapping: |
        root = if this.user_profile.tier == "premium" { this } else { deleted() }
    - rate_limit:
        resource: downstream_limiter
    - log:
        level: DEBUG
        message: "enriched event \${! json(\\"event_id\\") }"

output:
  switch:
    cases:
      - check: errored()
        output:
          kafka_franz:
            seed_brokers: ["broker-0:9092"]
            topic: events-dlq
            key: \${! json("event_id") }
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
      prefix: dedupe:
      default_ttl: 1h

rate_limit_resources:
  - label: downstream_limiter
    local:
      count: 1000
      interval: 1s

metrics:
  prometheus:
    use_histogram_timing: true

logger:
  level: INFO
  format: json
`;

const allComponentsKitchenSink = `# Kitchen sink: many components for stress-testing the editor.
input:
  broker:
    inputs:
      - generate:
          interval: 100ms
          mapping: 'root = {"src":"gen-1"}'
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
              dsn: postgres://user:pass@db/x
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
            kafka_franz:
              seed_brokers: ["localhost:9092"]
              topic: events-archive

tracer:
  open_telemetry_collector:
    address: localhost:4317
    sampling:
      enabled: true
      ratio: 0.1
`;

const malformedYaml = `# Intentionally broken — for testing editor error states.
input:
  kafka_franz
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
input:
  kafka_franz: {}

output:
  kafka_franz: {}
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
  kafka_franz:
    seed_brokers:
      - \${secrets.BROKER_1}
      - \${secrets.BROKER_2}
    topics: ["\${secrets.TOPIC_NAME}"]
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
    id: 'simple-generate-to-kafka',
    name: 'Simple — generate to Kafka',
    description: 'Synthetic JSON every second written to Kafka.',
    yaml: generateToKafka,
    tags: ['simple'],
  },
  {
    id: 'simple-noisy-logs',
    name: 'Simple — noisy multi-level logs',
    description: 'Emits TRACE/DEBUG/INFO/ERROR at 5 msg/sec — for testing the Logs tab.',
    yaml: noisyLogs,
    tags: ['simple'],
  },
  {
    id: 'medium-http-to-kafka',
    name: 'Medium — HTTP to Kafka with processors',
    description: 'HTTP ingest, schema decode, try/catch enrichment.',
    yaml: httpToKafkaWithProcessors,
    tags: ['medium'],
  },
  {
    id: 'complex-enterprise',
    name: 'Complex — multi-stage enterprise',
    description: 'Kafka -> dedupe -> branch enrich -> filter -> S3 + Kafka DLQ.',
    yaml: longComplexEnterprise,
    tags: ['complex'],
  },
  {
    id: 'complex-kitchen-sink',
    name: 'Complex — kitchen sink',
    description: 'Many component types for stress-testing the editor.',
    yaml: allComponentsKitchenSink,
    tags: ['complex'],
  },
  {
    id: 'edge-secrets-heavy',
    name: 'Edge — many secret references',
    description: 'Stress-test the ${secrets.X} parser/detector.',
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
