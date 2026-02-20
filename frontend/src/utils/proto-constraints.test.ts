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

import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { describe, expect, it } from 'vitest';

import {
  getFieldConstraints,
  getMessageConstraints,
  getStringFieldConstraints,
  protoToZodSchema,
} from './proto-constraints';

describe('proto-constraints', () => {
  describe('getFieldConstraints', () => {
    it('extracts string constraints from CreateUserRequest.User.name', () => {
      const nameField = CreateUserRequest_UserSchema.fields.find((f) => f.localName === 'name');
      expect(nameField).toBeDefined();

      const constraints = getFieldConstraints(nameField!);
      expect(constraints).toEqual({
        type: 'string',
        required: true,
        minLen: 1,
        maxLen: 128,
      });
    });

    it('extracts string constraints from CreateUserRequest.User.password', () => {
      const passwordField = CreateUserRequest_UserSchema.fields.find((f) => f.localName === 'password');
      expect(passwordField).toBeDefined();

      const constraints = getFieldConstraints(passwordField!);
      expect(constraints).toEqual({
        type: 'string',
        required: true,
        minLen: 3,
        maxLen: 128,
      });
    });

    it('extracts enum constraints from CreateUserRequest.User.mechanism', () => {
      const mechanismField = CreateUserRequest_UserSchema.fields.find((f) => f.localName === 'mechanism');
      expect(mechanismField).toBeDefined();

      const constraints = getFieldConstraints(mechanismField!);
      expect(constraints).toEqual({
        type: 'enum',
        required: true,
        definedOnly: true,
        notIn: [0],
      });
    });
  });

  describe('getMessageConstraints', () => {
    it('returns all field constraints for CreateUserRequest.User', () => {
      const constraints = getMessageConstraints(CreateUserRequest_UserSchema);

      expect(constraints.name).toEqual({
        type: 'string',
        required: true,
        minLen: 1,
        maxLen: 128,
      });
      expect(constraints.password).toEqual({
        type: 'string',
        required: true,
        minLen: 3,
        maxLen: 128,
      });
      expect(constraints.mechanism).toBeDefined();
      expect(constraints.mechanism.type).toBe('enum');
    });
  });

  describe('getStringFieldConstraints', () => {
    it('returns string constraints for a named field', () => {
      const constraints = getStringFieldConstraints(CreateUserRequest_UserSchema, 'name');
      expect(constraints).not.toBeNull();
      expect(constraints?.maxLen).toBe(128);
      expect(constraints?.minLen).toBe(1);
    });

    it('returns null for non-string fields', () => {
      const constraints = getStringFieldConstraints(CreateUserRequest_UserSchema, 'mechanism');
      expect(constraints).toBeNull();
    });

    it('returns null for non-existent fields', () => {
      const constraints = getStringFieldConstraints(CreateUserRequest_UserSchema, 'nonExistent');
      expect(constraints).toBeNull();
    });
  });

  describe('protoToZodSchema', () => {
    it('generates a Zod schema from CreateUserRequest.User', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);

      // Valid data should parse
      const valid = schema.safeParse({ name: 'testuser', password: 'abc', mechanism: 1 });
      expect(valid.success).toBe(true);
    });

    it('rejects empty name (minLen=1)', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);
      const result = schema.safeParse({ name: '', password: 'abc', mechanism: 1 });
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding 128 characters', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);
      const result = schema.safeParse({ name: 'a'.repeat(129), password: 'abc', mechanism: 1 });
      expect(result.success).toBe(false);
    });

    it('accepts name at exactly 128 characters', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);
      const result = schema.safeParse({ name: 'a'.repeat(128), password: 'abc', mechanism: 1 });
      expect(result.success).toBe(true);
    });

    it('rejects password shorter than 3 characters', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);
      const result = schema.safeParse({ name: 'test', password: 'ab', mechanism: 1 });
      expect(result.success).toBe(false);
    });

    it('rejects password exceeding 128 characters', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);
      const result = schema.safeParse({ name: 'test', password: 'a'.repeat(129), mechanism: 1 });
      expect(result.success).toBe(false);
    });

    it('exposes individual field schemas via .shape', () => {
      const schema = protoToZodSchema(CreateUserRequest_UserSchema);

      // The name field schema should be accessible
      const nameSchema = schema.shape.name;
      expect(nameSchema).toBeDefined();

      // And extendable with custom rules
      const extended = (nameSchema as import('zod').ZodString).regex(/^[a-z]+$/, 'Only lowercase');
      const result = extended.safeParse('UPPER');
      expect(result.success).toBe(false);
    });
  });
});
