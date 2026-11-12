import { z } from 'zod';

import { isUnknownArray } from '../utils/type-guards';

export const registryModeSchema = z.enum(['READWRITE', 'READONLY', 'IMPORT']);
export const registryModeWithDefaultSchema = registryModeSchema.or(z.literal('DEFAULT'));
export const registryCompatibilitySchema = z.enum([
  'NONE',
  'BACKWARD',
  'BACKWARD_TRANSITIVE',
  'FORWARD',
  'FORWARD_TRANSITIVE',
  'FULL',
  'FULL_TRANSITIVE',
]);
export const registryCompatibilityWithDefaultSchema = registryCompatibilitySchema.or(z.literal('DEFAULT'));

const contextSchema = z.looseObject({
  name: z.string(),
  mode: registryModeWithDefaultSchema.default('DEFAULT'),
  compatibility: registryCompatibilityWithDefaultSchema.default('DEFAULT'),
});
const subjectSchema = z.looseObject({ name: z.string(), isSoftDeleted: z.boolean() });
const referenceSchema = z.looseObject({ name: z.string(), subject: z.string(), version: z.number() });
const usageSchema = z.looseObject({ subject: z.string(), version: z.number() });
const versionSchema = z.looseObject({
  id: z.number(),
  version: z.number(),
  isSoftDeleted: z.boolean(),
  type: z.enum(['AVRO', 'JSON', 'PROTOBUF']),
  schema: z.string(),
  references: z.array(referenceSchema),
  metadata: z
    .looseObject({
      tags: z.record(z.string(), z.array(z.string())).optional(),
      properties: z.record(z.string(), z.string()).optional(),
      sensitive: z.array(z.string()).optional(),
    })
    .optional(),
});
export const subjectDetailsSchema = z.looseObject({
  name: z.string(),
  type: z.enum(['AVRO', 'JSON', 'PROTOBUF']),
  compatibility: registryCompatibilityWithDefaultSchema,
  mode: registryModeWithDefaultSchema,
  versions: z.array(z.looseObject({ version: z.number(), isSoftDeleted: z.boolean() })),
  latestActiveVersion: z.number(),
  schemas: z.array(versionSchema),
});
export const schemaTypesResponseSchema = z.looseObject({ schemaTypes: z.array(z.string()).optional() });
export const referencedBySchema = z.array(
  z.looseObject({
    schemaId: z.number(),
    error: z.string().optional(),
    usages: z.array(usageSchema).optional().default([]),
  })
);
export const createdSchemaSchema = z.looseObject({ id: z.number() });
export const schemaValidationSchema = z.looseObject({
  isValid: z.boolean(),
  parsingError: z.string().optional(),
  compatibility: z.looseObject({ isCompatible: z.boolean() }),
});

export function parseRegistryMode(value: unknown) {
  const response = z
    .looseObject({ isConfigured: z.boolean().optional(), mode: registryModeSchema.nullish() })
    .parse(value);
  return response.isConfigured === false ? null : (response.mode ?? null);
}
export function parseRegistryCompatibility(value: unknown) {
  const response = z
    .looseObject({ isConfigured: z.boolean().optional(), compatibility: registryCompatibilitySchema.nullish() })
    .parse(value);
  return response.isConfigured === false ? null : (response.compatibility ?? null);
}

// List endpoints also return an object when Schema Registry is not configured.
// Keep that existing empty-list behavior while validating every actual array entry.
export const parseRegistryContexts = (value: unknown) =>
  isUnknownArray(value) ? z.array(contextSchema).parse(value) : [];
export const parseRegistrySubjects = (value: unknown) =>
  isUnknownArray(value) ? z.array(subjectSchema).parse(value) : [];
export const parseRegistryUsages = (value: unknown) => (isUnknownArray(value) ? z.array(usageSchema).parse(value) : []);
