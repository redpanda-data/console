/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: part of tests */
import { parseYamlTemplateSecrets, toPostgresTableName } from './parse-yaml-template-secrets';

describe('toPostgresTableName', () => {
  test('should convert invalid characters to underscores', () => {
    expect(toPostgresTableName('topic-with-dashes')).toBe('topic_with_dashes');
    expect(toPostgresTableName('topic.with.dots')).toBe('topic_with_dots');
    expect(toPostgresTableName('topic/with/slashes')).toBe('topic_with_slashes');
    expect(toPostgresTableName('topic with spaces')).toBe('topic_with_spaces');
  });

  test('should ensure the name starts with a letter or underscore', () => {
    expect(toPostgresTableName('123-topic')).toBe('_123_topic');
    expect(toPostgresTableName('_valid-topic')).toBe('_valid_topic');
    expect(toPostgresTableName('validTopic')).toBe('validtopic');
  });

  test('should truncate names longer than 63 characters', () => {
    const longName = 'extremely_long_topic_name_that_exceeds_postgres_maximum_identifier_length_limit';
    expect(toPostgresTableName(longName).length).toBe(63);
    expect(toPostgresTableName(longName)).toBe(longName.substring(0, 63));
  });

  test('should convert to lowercase for consistency', () => {
    expect(toPostgresTableName('MixedCASE_Topic')).toBe('mixedcase_topic');
    expect(toPostgresTableName('UPPERCASE_TOPIC')).toBe('uppercase_topic');
  });
});

describe('parseYamlTemplateSecrets', () => {
  // Define test environment variables
  const testEnvVars = {
    REDPANDA_BROKERS: 'broker-1:9092,broker-2:9092',
    TOPIC: 'test-topic',
    POSTGRES_COMPATIBLE_TOPIC_NAME: 'test-topic-with-dashes',
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
      yamlTemplates: { 'some-template': { template: yamlWithEnvVars } },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result['some-template']).toContain('broker-1:9092,broker-2:9092');
    expect(result['some-template']).toContain('topic: test-topic');
    expect(result['some-template']).toContain('mechanism: SCRAM-SHA-256');
    expect(result['some-template']).toContain('username: test-user');
  });

  test('should handle POSTGRES_COMPATIBLE_TOPIC_NAME variables correctly', () => {
    const yamlWithPostgresCompatibleVar = `
      table: "\${POSTGRES_COMPATIBLE_TOPIC_NAME}"
      create_statement: |
        CREATE TABLE IF NOT EXISTS \${POSTGRES_COMPATIBLE_TOPIC_NAME} (key text PRIMARY KEY, data jsonb);
    `;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: { 'postgres-template': { template: yamlWithPostgresCompatibleVar } },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result['postgres-template']).toContain('CREATE TABLE IF NOT EXISTS test_topic_with_dashes');
  });

  test('should replace secret values with mapped format', () => {
    const yamlWithSecrets = `
      api_key: "\${secrets.OPENAI_KEY}"
      password: "\${secrets.KAFKA_PASSWORD}"
      dsn: "\${secrets.POSTGRES_DSN}"
    `;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: { 'some-template': { template: yamlWithSecrets } },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result['some-template']).toContain('${secrets.USER_DEFINED_OPENAI_KEY}');
    expect(result['some-template']).toContain('${secrets.USER_DEFINED_KAFKA_PASSWORD}');
    expect(result['some-template']).toContain('${secrets.USER_DEFINED_POSTGRES_DSN}');
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
          template1: { template: yamlTemplate1 },
          template2: { template: yamlTemplate2 },
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
        first: { template: firstTemplate },
        second: { template: secondTemplate },
      },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    expect(result.first).toContain('broker-1:9092,broker-2:9092');
    expect(result.first).toContain('topic: test-topic');
    expect(result.second).toContain('${secrets.USER_DEFINED_OPENAI_KEY}');
    expect(result.second).toContain('${secrets.USER_DEFINED_KAFKA_PASSWORD}');
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
                    SELECT document FROM "\${POSTGRES_COMPATIBLE_TOPIC_NAME}" ORDER BY embeddings <-> $1 LIMIT 5
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
    table: "\${POSTGRES_COMPATIBLE_TOPIC_NAME}"
    init_statement: |
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS \${POSTGRES_COMPATIBLE_TOPIC_NAME} (key text PRIMARY KEY, document text, embeddings vector(768));
`;

    const result = parseYamlTemplateSecrets({
      yamlTemplates: {
        'rag-chat': { template: ragChatYaml },
        'rag-indexing': { template: ragIndexingYaml },
      },
      envVars: testEnvVars,
      secretMappings: testSecretMappings,
    });

    // Validate rag-chat template
    expect(result['rag-chat']).toContain('${secrets.USER_DEFINED_OPENAI_KEY}');
    expect(result['rag-chat']).toContain('${secrets.USER_DEFINED_POSTGRES_DSN}');
    expect(result['rag-chat']).toContain('SELECT document FROM "test_topic_with_dashes"');

    // Validate rag-indexing template
    expect(result['rag-indexing']).toContain('broker-1:9092,broker-2:9092');
    expect(result['rag-indexing']).toContain('topics: ["test-topic"]');
    expect(result['rag-indexing']).toContain('test-topic-ai-pipeline');
    expect(result['rag-indexing']).toContain('SCRAM-SHA-256');
    expect(result['rag-indexing']).toContain('test-user');
    expect(result['rag-indexing']).toContain('${secrets.USER_DEFINED_KAFKA_PASSWORD}');
    expect(result['rag-indexing']).toContain('${secrets.USER_DEFINED_OPENAI_KEY}');
    expect(result['rag-indexing']).toContain('${secrets.USER_DEFINED_POSTGRES_DSN}');
    expect(result['rag-indexing']).toContain('table: "test_topic_with_dashes"');
    expect(result['rag-indexing']).toContain('CREATE TABLE IF NOT EXISTS test_topic_with_dashes');
  });

  describe('Glob pattern matching', () => {
    test('should correctly process comma-separated glob patterns', () => {
      const yamlTemplates = {
        'rag-git': {
          input: {
            git: {
              repository_url: '${REPOSITORY_URL}',
              branch: '${REPOSITORY_BRANCH}',
              poll_interval: '10s',
              include_patterns: ['${INCLUDE_GLOB_PATTERN}'],
              max_file_size: 1048576,
            },
          },
        },
      };

      const envVars = {
        REPOSITORY_URL: 'https://github.com/example/repo.git',
        REPOSITORY_BRANCH: 'main',
        INCLUDE_GLOB_PATTERN: '**/*.adoc, **/*.tsx',
      };

      const result = parseYamlTemplateSecrets({
        yamlTemplates,
        envVars,
        secretMappings: {},
      });

      expect(result['rag-git']).toMatchInlineSnapshot(`
        "input:
          git:
            repository_url: https://github.com/example/repo.git
            branch: main
            poll_interval: 10s
            include_patterns:
              - "**/*.adoc"
              - "**/*.tsx"
            max_file_size: 1048576
        "
      `);
    });

    test('should correctly handle a single glob pattern', () => {
      const yamlTemplates = {
        'rag-git': {
          input: {
            git: {
              include_patterns: ['${INCLUDE_GLOB_PATTERN}'],
            },
          },
        },
      };

      const envVars = {
        INCLUDE_GLOB_PATTERN: '**/*.md',
      };

      const result = parseYamlTemplateSecrets({
        yamlTemplates,
        envVars,
        secretMappings: {},
      });

      expect(result['rag-git']).toMatchInlineSnapshot(`
        "input:
          git:
            include_patterns:
              - "**/*.md"
        "
      `);
    });

    test('should handle whitespace in glob patterns correctly', () => {
      const yamlTemplates = {
        'rag-git': {
          input: {
            git: {
              include_patterns: ['${INCLUDE_GLOB_PATTERN}'],
            },
          },
        },
      };

      const envVars = {
        INCLUDE_GLOB_PATTERN: '  **/*.js,  **/*.ts  , **/*.jsx  ',
      };

      const result = parseYamlTemplateSecrets({
        yamlTemplates,
        envVars,
        secretMappings: {},
      });

      expect(result['rag-git']).toMatchInlineSnapshot(`
        "input:
          git:
            include_patterns:
              - "**/*.js"
              - "**/*.ts"
              - "**/*.jsx"
        "
      `);
    });

    test('should handle exclude patterns correctly', () => {
      const yamlTemplates = {
        'rag-git': {
          input: {
            git: {
              exclude_patterns: ['${EXCLUDE_GLOB_PATTERN}'],
            },
          },
        },
      };

      const envVars = {
        EXCLUDE_GLOB_PATTERN: '',
      };

      const result = parseYamlTemplateSecrets({
        yamlTemplates,
        envVars,
        secretMappings: {},
      });

      expect(result['rag-git']).toMatchInlineSnapshot(`
        "input:
          git: {}
        "
      `);
    });
  });
});
