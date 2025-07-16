/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  KnowledgeBase_VectorDatabase_PostgresSchema,
  KnowledgeBaseSchema,
  KnowledgeBaseUpdateSchema,
} from '../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  debugFieldBehaviors,
  getMessageFieldMetadata,
  isFieldEditable,
  isFieldImmutable,
  isFieldOutputOnly,
  isFieldRequired,
} from './protobuf-reflection';

describe('Protobuf Field Reflection', () => {
  test('should detect field behaviors for KnowledgeBase', () => {
    debugFieldBehaviors(KnowledgeBaseSchema);

    // Test specific field behaviors we expect
    expect(isFieldRequired(KnowledgeBaseSchema, 'id')).toBe(true);
    expect(isFieldImmutable(KnowledgeBaseSchema, 'id')).toBe(false); // id is REQUIRED but not IMMUTABLE
    expect(isFieldEditable(KnowledgeBaseSchema, 'id')).toBe(false); // id is OUTPUT_ONLY, so not editable

    expect(isFieldRequired(KnowledgeBaseSchema, 'display_name')).toBe(true);
    expect(isFieldEditable(KnowledgeBaseSchema, 'display_name')).toBe(true);

    expect(isFieldOutputOnly(KnowledgeBaseSchema, 'retrieval_api_url')).toBe(true);
    expect(isFieldEditable(KnowledgeBaseSchema, 'retrieval_api_url')).toBe(false);
  });

  test('should detect field behaviors for KnowledgeBaseUpdate', () => {
    debugFieldBehaviors(KnowledgeBaseUpdateSchema);

    const _metadata = getMessageFieldMetadata(KnowledgeBaseUpdateSchema);

    // KnowledgeBaseUpdate should not have id or retrieval_api_url fields
    expect(KnowledgeBaseUpdateSchema.fields.find((f) => f.name === 'id')).toBeUndefined();
    expect(KnowledgeBaseUpdateSchema.fields.find((f) => f.name === 'retrieval_api_url')).toBeUndefined();

    // But should have editable fields (note: field name is display_name in schema, not displayName)
    expect(isFieldRequired(KnowledgeBaseUpdateSchema, 'display_name')).toBe(true);
    expect(isFieldEditable(KnowledgeBaseUpdateSchema, 'display_name')).toBe(true);
  });

  test('should detect field behaviors for nested Postgres schema', () => {
    debugFieldBehaviors(KnowledgeBase_VectorDatabase_PostgresSchema);

    const _metadata = getMessageFieldMetadata(KnowledgeBase_VectorDatabase_PostgresSchema);

    // Test PostgreSQL fields
    expect(isFieldRequired(KnowledgeBase_VectorDatabase_PostgresSchema, 'dsn')).toBe(true);
    expect(isFieldRequired(KnowledgeBase_VectorDatabase_PostgresSchema, 'table')).toBe(true);
    expect(isFieldImmutable(KnowledgeBase_VectorDatabase_PostgresSchema, 'table')).toBe(true);
  });

  test('should handle non-existent fields gracefully', () => {
    expect(isFieldRequired(KnowledgeBaseSchema, 'nonExistentField')).toBe(false);
    expect(isFieldImmutable(KnowledgeBaseSchema, 'nonExistentField')).toBe(false);
    expect(isFieldEditable(KnowledgeBaseSchema, 'nonExistentField')).toBe(true); // default to editable
  });
});
