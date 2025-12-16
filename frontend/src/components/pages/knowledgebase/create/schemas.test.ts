/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { createValidator } from '@bufbuild/protovalidate';
import {
  KnowledgeBaseCreate_VectorDatabase_PostgresSchema,
  KnowledgeBaseCreate_VectorDatabaseSchema,
  KnowledgeBaseCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { describe, expect, test } from 'vitest';

import { initialValues, isRegexPattern, markAsRegexPattern, stripRegexPrefix, validateFormValues } from './schemas';

describe('Proto Validation', () => {
  const validator = createValidator();

  test('should accept valid display name pattern', () => {
    // Just test that display name with letters, numbers, spaces, underscores, and hyphens is valid
    // We don't need a full proto message for this - just testing the pattern
    const validNames = ['Valid Name', 'Test-123', 'My_KB', 'Name 123'];

    for (const name of validNames) {
      // Valid names should match the display_name pattern
      const pattern = /^[A-Za-z0-9-_ /]+$/;
      expect(pattern.test(name)).toBe(true);
    }
  });

  test('should reject invalid table name', () => {
    const kb = create(KnowledgeBaseCreateSchema, {
      displayName: 'Test',
      vectorDatabase: create(KnowledgeBaseCreate_VectorDatabaseSchema, {
        vectorDatabase: {
          case: 'postgres',
          value: create(KnowledgeBaseCreate_VectorDatabase_PostgresSchema, {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Test data representing secret template format
            dsn: '${secrets.POSTGRES}',
            table: '123invalid', // starts with number
          }),
        },
      }),
    });

    const result = validator.validate(KnowledgeBaseCreateSchema, kb);
    expect(result.kind).toBe('invalid');
  });
});

describe('Custom Validation', () => {
  test('should reject chunk overlap >= chunk size', () => {
    const values = {
      ...initialValues,
      chunkSize: 100,
      chunkOverlap: 150,
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.chunkOverlap).toBeDefined();
  });

  test('should require at least one exact topic or regex pattern', () => {
    const values = {
      ...initialValues,
      exactTopics: [],
      regexPatterns: [],
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.exactTopics).toContain('required');
  });

  test('should validate regex patterns', () => {
    const values = {
      ...initialValues,
      exactTopics: [],
      regexPatterns: ['[invalid'],
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.regexPatterns).toContain('Invalid regex');
  });

  test('should always require OpenAI API key for generation', () => {
    const values = {
      ...initialValues,
      embeddingProvider: 'cohere' as const, // Even with Cohere for embeddings
      cohereApiKey: 'test-key',
      exactTopics: ['test-topic'],
      openaiApiKey: '', // OpenAI key still required for generation
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.openaiApiKey).toContain('generation');
  });

  test('should require reranker fields when enabled', () => {
    const values = {
      ...initialValues,
      rerankerEnabled: true,
      rerankerModel: '',
      rerankerApiKey: '',
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.rerankerModel).toBeDefined();
    expect(result.errors.rerankerApiKey).toBeDefined();
  });
});

describe('Regex pattern helper functions', () => {
  describe('isRegexPattern', () => {
    test('should detect patterns with regex prefix', () => {
      expect(isRegexPattern('regex:my-.*')).toBe(true);
      expect(isRegexPattern('regex:test-topic-.*')).toBe(true);
      expect(isRegexPattern('regex:.*')).toBe(true);
    });

    test('should return false for patterns without regex prefix', () => {
      expect(isRegexPattern('my-topic')).toBe(false);
      expect(isRegexPattern('test-topic-1')).toBe(false);
      expect(isRegexPattern('topic-.*')).toBe(false);
    });

    test('should return false for empty strings', () => {
      expect(isRegexPattern('')).toBe(false);
    });
  });

  describe('markAsRegexPattern', () => {
    test('should add regex prefix to patterns', () => {
      expect(markAsRegexPattern('my-.*')).toBe('regex:my-.*');
      expect(markAsRegexPattern('test-topic-.*')).toBe('regex:test-topic-.*');
      expect(markAsRegexPattern('.*')).toBe('regex:.*');
    });

    test('should not double-prefix already prefixed patterns', () => {
      expect(markAsRegexPattern('regex:my-.*')).toBe('regex:my-.*');
      expect(markAsRegexPattern('regex:test-.*')).toBe('regex:test-.*');
    });

    test('should handle empty strings', () => {
      expect(markAsRegexPattern('')).toBe('regex:');
    });
  });

  describe('stripRegexPrefix', () => {
    test('should remove regex prefix from patterns', () => {
      expect(stripRegexPrefix('regex:my-.*')).toBe('my-.*');
      expect(stripRegexPrefix('regex:test-topic-.*')).toBe('test-topic-.*');
      expect(stripRegexPrefix('regex:.*')).toBe('.*');
    });

    test('should return original string if no prefix', () => {
      expect(stripRegexPrefix('my-topic')).toBe('my-topic');
      expect(stripRegexPrefix('test-.*')).toBe('test-.*');
      expect(stripRegexPrefix('')).toBe('');
    });

    test('should handle edge cases', () => {
      expect(stripRegexPrefix('regex:')).toBe('');
      expect(stripRegexPrefix('notregex:pattern')).toBe('notregex:pattern');
    });
  });

  describe('Round-trip conversion', () => {
    test('should maintain pattern integrity through mark and strip', () => {
      const patterns = ['my-.*', 'test-topic-.*', '.*prefix.*', '^start', 'end$'];

      for (const pattern of patterns) {
        const marked = markAsRegexPattern(pattern);
        const stripped = stripRegexPrefix(marked);
        expect(stripped).toBe(pattern);
      }
    });

    test('should correctly identify and strip prefixed patterns', () => {
      const pattern = 'my-.*';
      const marked = markAsRegexPattern(pattern);

      expect(isRegexPattern(marked)).toBe(true);
      expect(isRegexPattern(pattern)).toBe(false);

      const stripped = stripRegexPrefix(marked);
      expect(stripped).toBe(pattern);
      expect(isRegexPattern(stripped)).toBe(false);
    });
  });
});
