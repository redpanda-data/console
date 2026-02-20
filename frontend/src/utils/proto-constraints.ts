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

import type { DescField, DescMessage } from '@bufbuild/protobuf';
import { getOption, hasOption } from '@bufbuild/protobuf';
import type { EnumRules, Int32Rules, RepeatedRules, StringRules } from 'protogen/buf/validate/validate_pb';
import { field as fieldExt } from 'protogen/buf/validate/validate_pb';
import { z } from 'zod';

// ── Constraint types ──────────────────────────────────────────────────

export type StringConstraints = {
  type: 'string';
  required: boolean;
  minLen?: number;
  maxLen?: number;
  pattern?: string;
  const?: string;
  email?: boolean;
  uri?: boolean;
  hostname?: boolean;
  uuid?: boolean;
};

export type NumberConstraints = {
  type: 'number';
  required: boolean;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  in?: number[];
  notIn?: number[];
};

export type EnumConstraints = {
  type: 'enum';
  required: boolean;
  definedOnly: boolean;
  in?: number[];
  notIn?: number[];
};

export type RepeatedConstraints = {
  type: 'repeated';
  required: boolean;
  minItems?: number;
  maxItems?: number;
  unique: boolean;
};

export type MessageConstraints = {
  type: 'message';
  required: boolean;
};

export type BoolConstraints = {
  type: 'bool';
  required: boolean;
};

export type FieldConstraint =
  | StringConstraints
  | NumberConstraints
  | EnumConstraints
  | RepeatedConstraints
  | MessageConstraints
  | BoolConstraints;

// ── Constraint extraction ─────────────────────────────────────────────

function extractStringConstraints(rules: StringRules, required: boolean): StringConstraints {
  const constraints: StringConstraints = { type: 'string', required };

  if (rules.minLen > 0n) {
    constraints.minLen = Number(rules.minLen);
  }
  if (rules.maxLen > 0n) {
    constraints.maxLen = Number(rules.maxLen);
  }
  if (rules.pattern) {
    constraints.pattern = rules.pattern;
  }
  if (rules.const) {
    constraints.const = rules.const;
  }

  switch (rules.wellKnown.case) {
    case 'email': {
      constraints.email = true;
      break;
    }
    case 'uri': {
      constraints.uri = true;
      break;
    }
    case 'hostname': {
      constraints.hostname = true;
      break;
    }
    case 'uuid': {
      constraints.uuid = true;
      break;
    }
    default:
      break;
  }

  return constraints;
}

function extractInt32Constraints(rules: Int32Rules, required: boolean): NumberConstraints {
  const constraints: NumberConstraints = { type: 'number', required };

  if (rules.greaterThan.case === 'gt') {
    constraints.gt = rules.greaterThan.value;
  }
  if (rules.greaterThan.case === 'gte') {
    constraints.gte = rules.greaterThan.value;
  }
  if (rules.lessThan.case === 'lt') {
    constraints.lt = rules.lessThan.value;
  }
  if (rules.lessThan.case === 'lte') {
    constraints.lte = rules.lessThan.value;
  }
  if (rules.in.length > 0) {
    constraints.in = [...rules.in];
  }
  if (rules.notIn.length > 0) {
    constraints.notIn = [...rules.notIn];
  }

  return constraints;
}

function extractEnumConstraints(rules: EnumRules, required: boolean): EnumConstraints {
  const constraints: EnumConstraints = {
    type: 'enum',
    required,
    definedOnly: rules.definedOnly,
  };

  if (rules.in.length > 0) {
    constraints.in = [...rules.in];
  }
  if (rules.notIn.length > 0) {
    constraints.notIn = [...rules.notIn];
  }

  return constraints;
}

function extractRepeatedConstraints(rules: RepeatedRules, required: boolean): RepeatedConstraints {
  const constraints: RepeatedConstraints = {
    type: 'repeated',
    required,
    unique: rules.unique,
  };

  if (rules.minItems > 0n) {
    constraints.minItems = Number(rules.minItems);
  }
  if (rules.maxItems > 0n) {
    constraints.maxItems = Number(rules.maxItems);
  }

  return constraints;
}

/** Extract type-specific constraints from a FieldRules object. */
function extractTypedConstraints(
  rules: { type: { case: string | undefined; value?: unknown } },
  required: boolean
): FieldConstraint | null {
  switch (rules.type.case) {
    case 'string':
      return extractStringConstraints(rules.type.value as StringRules, required);
    case 'int32':
    case 'uint32':
    case 'sint32':
      return extractInt32Constraints(rules.type.value as Int32Rules, required);
    case 'enum':
      return extractEnumConstraints(rules.type.value as EnumRules, required);
    case 'repeated':
      return extractRepeatedConstraints(rules.type.value as RepeatedRules, required);
    default:
      return null;
  }
}

/** Infer a constraint type from the proto field descriptor kind. */
function inferConstraintFromFieldKind(fieldDesc: DescField, required: boolean): FieldConstraint | null {
  if (fieldDesc.fieldKind === 'message') {
    return { type: 'message', required };
  }
  if (fieldDesc.fieldKind === 'enum') {
    return { type: 'enum', required, definedOnly: false };
  }
  if (fieldDesc.fieldKind === 'list') {
    return { type: 'repeated', required, unique: false };
  }
  if (fieldDesc.fieldKind === 'scalar') {
    switch (fieldDesc.scalar) {
      case 9: // STRING
        return { type: 'string', required };
      case 5: // INT32
      case 13: // UINT32
      case 17: // SINT32
        return { type: 'number', required };
      case 8: // BOOL
        return { type: 'bool', required };
      default:
        return null;
    }
  }
  return null;
}

/**
 * Extract validation constraints from a single proto field descriptor.
 * Returns null if the field has no buf.validate annotations.
 */
export function getFieldConstraints(fieldDesc: DescField): FieldConstraint | null {
  if (!hasOption(fieldDesc, fieldExt)) {
    return null;
  }

  const rules = getOption(fieldDesc, fieldExt);
  const required = rules.required;

  // Try to extract type-specific constraints first
  const typed = extractTypedConstraints(rules, required);
  if (typed) {
    return typed;
  }

  // Fall back to inferring from the field descriptor kind
  return inferConstraintFromFieldKind(fieldDesc, required);
}

/**
 * Extract all field constraints from a proto message descriptor.
 */
export function getMessageConstraints(schema: DescMessage): Record<string, FieldConstraint> {
  const result: Record<string, FieldConstraint> = {};

  for (const fieldDesc of schema.fields) {
    const constraint = getFieldConstraints(fieldDesc);
    if (constraint) {
      result[fieldDesc.localName] = constraint;
    }
  }

  return result;
}

// ── Zod schema generation ─────────────────────────────────────────────

function stringConstraintsToZod(c: StringConstraints): z.ZodString {
  let schema = z.string();

  if (c.required && !c.minLen) {
    schema = schema.min(1, 'This field is required');
  }
  if (c.minLen !== undefined) {
    schema = schema.min(c.minLen, `Must be at least ${c.minLen} characters`);
  }
  if (c.maxLen !== undefined) {
    schema = schema.max(c.maxLen, `Must not exceed ${c.maxLen} characters`);
  }
  if (c.pattern) {
    schema = schema.regex(new RegExp(c.pattern), 'Invalid format');
  }
  if (c.email) {
    schema = schema.email('Must be a valid email');
  }
  if (c.uri) {
    schema = schema.url('Must be a valid URL');
  }
  if (c.uuid) {
    schema = schema.uuid('Must be a valid UUID');
  }

  return schema;
}

function numberConstraintsToZod(c: NumberConstraints): z.ZodNumber {
  let schema = z.number();

  if (c.gte !== undefined) {
    schema = schema.min(c.gte);
  }
  if (c.gt !== undefined) {
    schema = schema.gt(c.gt);
  }
  if (c.lte !== undefined) {
    schema = schema.max(c.lte);
  }
  if (c.lt !== undefined) {
    schema = schema.lt(c.lt);
  }

  return schema;
}

function repeatedConstraintsToZod(c: RepeatedConstraints): z.ZodArray<z.ZodUnknown> {
  let schema = z.array(z.unknown());

  if (c.minItems !== undefined) {
    schema = schema.min(c.minItems);
  }
  if (c.maxItems !== undefined) {
    schema = schema.max(c.maxItems);
  }

  return schema;
}

function constraintToZod(constraint: FieldConstraint): z.ZodTypeAny {
  switch (constraint.type) {
    case 'string':
      return stringConstraintsToZod(constraint);
    case 'number':
      return numberConstraintsToZod(constraint);
    case 'enum':
      return z.number();
    case 'repeated':
      return repeatedConstraintsToZod(constraint);
    case 'bool':
      return z.boolean();
    case 'message':
      return z.unknown().optional();
    default:
      return z.unknown().optional();
  }
}

/**
 * Convert a proto message descriptor into a Zod object schema by reading
 * buf.validate annotations from each field.
 *
 * Use `.shape.fieldName` to access individual field schemas and extend
 * them with custom rules like `.regex()` or `.refine()`.
 *
 * Enum fields are z.number() since proto enums are numeric. Override
 * in your form schema if you use string representations.
 */
export function protoToZodSchema(schema: DescMessage): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const fieldDesc of schema.fields) {
    const constraint = getFieldConstraints(fieldDesc);
    shape[fieldDesc.localName] = constraint ? constraintToZod(constraint) : z.unknown().optional();
  }

  return z.object(shape);
}

/**
 * Get the string constraints for a specific field of a proto message.
 * Useful for extracting individual values like maxLen for display.
 */
export function getStringFieldConstraints(schema: DescMessage, fieldName: string): StringConstraints | null {
  const fieldDesc = schema.fields.find((f) => f.localName === fieldName);
  if (!fieldDesc) {
    return null;
  }

  const constraint = getFieldConstraints(fieldDesc);
  if (constraint?.type === 'string') {
    return constraint;
  }
  return null;
}
