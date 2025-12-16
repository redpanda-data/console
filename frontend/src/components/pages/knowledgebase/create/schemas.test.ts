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

import { describe, expect, test } from 'vitest';

import { isRegexPattern, KnowledgeBaseCreateFormSchema, markAsRegexPattern, stripRegexPrefix } from './schemas';

describe('KnowledgeBaseCreateFormSchema', () => {
  describe('postgresTable validation', () => {
    const validBaseData = {
      displayName: 'Test KB',
      vectorDatabaseType: 'postgres' as const,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Test data representing secret template format
      postgresDsn: '${secrets.POSTGRES_DSN}',
      postgresTable: 'valid_table',
      embeddingProvider: 'openai' as const,
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 768,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Test data representing secret template format
      openaiApiKey: '${secrets.OPENAI_API_KEY}',
      chunkSize: 512,
      chunkOverlap: 100,
      exactTopics: ['test-topic'],
      regexPatterns: [],
      redpandaUsername: 'test-user',
      // biome-ignore lint/complexity/noUselessStringConcat: Intentional format to represent template string pattern
      redpandaPassword: '$' + '{secrets.PASSWORD}',
      rerankerEnabled: true,
      rerankerModel: 'rerank-v3.5',
      // biome-ignore lint/complexity/noUselessStringConcat: Intentional format to represent template string pattern
      rerankerApiKey: '$' + '{secrets.COHERE_API_KEY}',
      generationModel: 'gpt-4',
    };

    test('should accept table names starting with a letter', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        postgresTable: 'myTable',
      });

      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.errors, null, 2));
      }

      expect(result.success).toBe(true);
    });

    test('should accept table names with letters, numbers, and underscores', () => {
      const validNames = ['table123', 'my_table', 'Table_Name_123', 'a', 'A1', 'test_table_2024'];

      for (const tableName of validNames) {
        const result = KnowledgeBaseCreateFormSchema.safeParse({
          ...validBaseData,
          postgresTable: tableName,
        });

        expect(result.success, `Expected "${tableName}" to be valid`).toBe(true);
      }
    });

    test('should reject table names starting with a number', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        postgresTable: '123table',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const tableError = result.error.errors.find((err) => err.path[0] === 'postgresTable');
        expect(tableError?.message).toContain('must start with a letter');
      }
    });

    test('should reject table names starting with an underscore', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        postgresTable: '_table',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const tableError = result.error.errors.find((err) => err.path[0] === 'postgresTable');
        expect(tableError?.message).toContain('must start with a letter');
      }
    });

    test('should reject table names with special characters', () => {
      const invalidNames = ['table-name', 'table.name', 'table name', 'table@name', 'table$name', 'table#name'];

      for (const tableName of invalidNames) {
        const result = KnowledgeBaseCreateFormSchema.safeParse({
          ...validBaseData,
          postgresTable: tableName,
        });

        expect(result.success, `Expected "${tableName}" to be invalid`).toBe(false);
        if (!result.success) {
          const tableError = result.error.errors.find((err) => err.path[0] === 'postgresTable');
          expect(tableError?.message).toContain('must start with a letter');
        }
      }
    });

    test('should reject empty table names', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        postgresTable: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const tableError = result.error.errors.find((err) => err.path[0] === 'postgresTable');
        expect(tableError?.message).toBeTruthy();
      }
    });
  });

  describe('redpanda credentials validation', () => {
    const validBaseData = {
      displayName: 'Test KB',
      vectorDatabaseType: 'postgres' as const,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Test data representing secret template format
      postgresDsn: '${secrets.POSTGRES_DSN}',
      postgresTable: 'valid_table',
      embeddingProvider: 'openai' as const,
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 768,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Test data representing secret template format
      openaiApiKey: '${secrets.OPENAI_API_KEY}',
      chunkSize: 512,
      chunkOverlap: 100,
      exactTopics: ['test-topic'],
      regexPatterns: [],
      redpandaUsername: 'test-user',
      // biome-ignore lint/complexity/noUselessStringConcat: Intentional format to represent template string pattern
      redpandaPassword: '$' + '{secrets.PASSWORD}',
      rerankerEnabled: true,
      rerankerModel: 'rerank-v3.5',
      // biome-ignore lint/complexity/noUselessStringConcat: Intentional format to represent template string pattern
      rerankerApiKey: '$' + '{secrets.COHERE_API_KEY}',
      generationModel: 'gpt-4',
    };

    test('should accept valid username and password', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse(validBaseData);

      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.errors, null, 2));
      }

      expect(result.success).toBe(true);
    });

    test('should reject empty username', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        redpandaUsername: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const usernameError = result.error.errors.find((err) => err.path[0] === 'redpandaUsername');
        expect(usernameError?.message).toContain('required');
      }
    });

    test('should reject empty password', () => {
      const result = KnowledgeBaseCreateFormSchema.safeParse({
        ...validBaseData,
        redpandaPassword: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const passwordError = result.error.errors.find((err) => err.path[0] === 'redpandaPassword');
        expect(passwordError?.message).toContain('required');
      }
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
});
