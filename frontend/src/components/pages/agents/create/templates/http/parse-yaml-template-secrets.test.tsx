import { parseYamlTemplateSecrets } from './parse-yaml-template-secrets';

describe('parseYamlTemplateSecrets', () => {
  // Define test environment variables
  const testEnvVars = {
    REDPANDA_BROKERS: 'broker-1:9092,broker-2:9092',
    TOPIC: 'test-topic',
    SASL_MECHANISM: 'SCRAM-SHA-256',
    USERNAME: 'test-user',
    KAFKA_USERNAME: 'kafka-user',
  };

  // Define test secret mappings
  const testSecretMappings = {
    OPENAI_KEY: 'USER_DEFINED_OPENAI_KEY',
    KAFKA_PASSWORD: 'USER_DEFINED_KAFKA_PASSWORD',
    POSTGRES_DSN: 'USER_DEFINED_POSTGRES_DSN',
  };

  test('should replace environment variables with their values', () => {
    const yamlWithEnvVars = `
      brokers: ["\${REDPANDA_BROKERS}"]
      topic: \${TOPIC}
      mechanism: \${SASL_MECHANISM}
      username: \${USERNAME}
    `;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: { template: yamlWithEnvVars },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result.template).toContain('brokers: ["broker-1:9092,broker-2:9092"]');
    expect(result.template).toContain('topic: test-topic');
    expect(result.template).toContain('mechanism: SCRAM-SHA-256');
    expect(result.template).toContain('username: test-user');
  });

  test('should replace secret values with mapped format', () => {
    const yamlWithSecrets = `
      api_key: "\${secrets.OPENAI_KEY}"
      password: "\${secrets.KAFKA_PASSWORD}"
      dsn: "\${secrets.POSTGRES_DSN}"
    `;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: { template: yamlWithSecrets },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result.template).toContain('api_key: "${secrets.USER_DEFINED_OPENAI_KEY}"');
    expect(result.template).toContain('password: "${secrets.USER_DEFINED_KAFKA_PASSWORD}"');
    expect(result.template).toContain('dsn: "${secrets.USER_DEFINED_POSTGRES_DSN}"');
  });

  test('should throw error for missing environment variables and secrets across all templates', () => {
    const yamlTemplate1 = `
      broker1: \${MISSING_BROKER1}
      topic: \${TOPIC}
    `;

    const yamlTemplate2 = `
      broker2: \${MISSING_BROKER2}
      api_key: "\${secrets.MISSING_SECRET1}"
    `;

    expect(() => {
      parseYamlTemplateSecrets({
        yamlTemplates: {
          template1: yamlTemplate1,
          template2: yamlTemplate2,
        },
        envVars: testEnvVars,
        secretMappings: testSecretMappings,
      });
    }).toThrow(
      /Missing environment variables: MISSING_BROKER1, MISSING_BROKER2.*Missing secret mappings: MISSING_SECRET1/,
    );
  });

  test('should handle multiple templates with different variable references', () => {
    const firstTemplate = `
      brokers: ["\${REDPANDA_BROKERS}"]
      topic: \${TOPIC}
    `;

    const secondTemplate = `
      api_key: "\${secrets.OPENAI_KEY}"
      password: "\${secrets.KAFKA_PASSWORD}"
    `;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: {
        first: firstTemplate,
        second: secondTemplate,
      },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result.first).toContain('brokers: ["broker-1:9092,broker-2:9092"]');
    expect(result.first).toContain('topic: test-topic');
    expect(result.second).toContain('api_key: "${secrets.USER_DEFINED_OPENAI_KEY}"');
    expect(result.second).toContain('password: "${secrets.USER_DEFINED_KAFKA_PASSWORD}"');
  });

  test('should process both rag-chat-yaml and rag-indexing-yaml together', () => {
    const ragChatYaml = `
input:
  http_server:
    path: /post/chat
    allowed_verbs:
      - POST
pipeline:
  processors:
    - openai_chat_completion:
        api_key: "\${secrets.OPENAI_KEY}"
        model: "gpt-4o"
        system_prompt: |
          You are a helpful question answering AI agent.
        prompt: "\${!this.question}"
        response_format: text
        tools:
          - name: SearchVectorDB
            processors:
              - openai_embeddings:
                  api_key: "\${secrets.OPENAI_KEY}"
                  model: text-embedding-3-small
                  text_mapping: "this.question"
                  dimensions: 768
              - sql_raw:
                  driver: "postgres"
                  dsn: "\${secrets.POSTGRES_DSN}"
                  query: |
                    SELECT document FROM "\${TOPIC}" ORDER BY embeddings <-> $1 LIMIT 5
                  args_mapping: "[ this.vector() ]"
output:
  sync_response: {}
`;

    const ragIndexingYaml = `
input:
  kafka_franz:
    seed_brokers: ["\${REDPANDA_BROKERS}"]
    topics: ["\${TOPIC}"]
    consumer_group: "\${TOPIC}-ai-pipeline"
    tls:
      enabled: true
    sasl:
      - mechanism: \${SASL_MECHANISM}
        username: \${USERNAME}
        password: "\${secrets.KAFKA_PASSWORD}"
pipeline:
  processors:
  - mapping: |
      root.document = content().string()
  - label: embeddings
    branch:
      processors:
      - openai_embeddings:
          api_key: "\${secrets.OPENAI_KEY}"
          model: text-embedding-3-small
          text_mapping: "this.document"
          dimensions: 768
      result_map:
        root.embeddings = this
output:
  sql_insert:
    driver: "postgres"
    dsn: "\${secrets.POSTGRES_DSN}"
    table: "\${TOPIC}"
    init_statement: |
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS \${TOPIC} (key text PRIMARY KEY, document text, embeddings vector(768));
`;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: {
        'rag-chat': ragChatYaml,
        'rag-indexing': ragIndexingYaml,
      },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    // Validate rag-chat template
    expect(result['rag-chat']).toContain('api_key: "${secrets.USER_DEFINED_OPENAI_KEY}"');
    expect(result['rag-chat']).toContain('dsn: "${secrets.USER_DEFINED_POSTGRES_DSN}"');
    expect(result['rag-chat']).toContain('SELECT document FROM "test-topic"');

    // Validate rag-indexing template
    expect(result['rag-indexing']).toContain('seed_brokers: ["broker-1:9092,broker-2:9092"]');
    expect(result['rag-indexing']).toContain('topics: ["test-topic"]');
    expect(result['rag-indexing']).toContain('consumer_group: "test-topic-ai-pipeline"');
    expect(result['rag-indexing']).toContain('mechanism: SCRAM-SHA-256');
    expect(result['rag-indexing']).toContain('username: test-user');
    expect(result['rag-indexing']).toContain('password: "${secrets.USER_DEFINED_KAFKA_PASSWORD}"');
    expect(result['rag-indexing']).toContain('api_key: "${secrets.USER_DEFINED_OPENAI_KEY}"');
    expect(result['rag-indexing']).toContain('dsn: "${secrets.USER_DEFINED_POSTGRES_DSN}"');
    expect(result['rag-indexing']).toContain('table: "test-topic"');
    expect(result['rag-indexing']).toContain('CREATE TABLE IF NOT EXISTS test-topic');
  });
});
