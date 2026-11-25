import type { z } from 'zod';

import {
  parseRegistryCompatibility,
  parseRegistryContexts,
  parseRegistryMode,
  parseRegistrySubjects,
  parseRegistryUsages,
  referencedBySchema,
  subjectDetailsSchema,
} from './schema-registry-contract';
import { expect, test } from 'bun:test';

test('keeps unconfigured registry responses empty without treating malformed array entries as subjects', () => {
  expect(parseRegistryMode({ isConfigured: false })).toBeNull();
  expect(parseRegistryCompatibility({ isConfigured: false })).toBeNull();
  expect(parseRegistryContexts({ isConfigured: false })).toStrictEqual([]);
  expect(parseRegistrySubjects({ isConfigured: false })).toStrictEqual([]);
  expect(parseRegistryUsages({ isConfigured: false })).toStrictEqual([]);
  expect(() => parseRegistrySubjects([{ name: 'orders', isSoftDeleted: 'false' }])).toThrow();
});

test('keeps inherited context settings and validates configured mode values', () => {
  expect(parseRegistryContexts([{ name: '.orders' }])).toStrictEqual([
    { name: '.orders', mode: 'DEFAULT', compatibility: 'DEFAULT' },
  ]);
  expect(parseRegistryMode({ mode: 'READONLY' })).toBe('READONLY');
  expect(parseRegistryCompatibility({ compatibility: 'FULL_TRANSITIVE' })).toBe('FULL_TRANSITIVE');
  expect(() => parseRegistryMode({ mode: { value: 'READONLY' } })).toThrow();
});

test('preserves reference metadata and protobuf message information while rejecting unsafe schema shapes', () => {
  const details = {
    name: 'orders',
    type: 'PROTOBUF',
    mode: 'READWRITE',
    compatibility: 'FULL',
    latestActiveVersion: 1,
    versions: [{ version: 1, isSoftDeleted: false }],
    schemas: [
      {
        id: 1,
        version: 1,
        isSoftDeleted: false,
        type: 'PROTOBUF',
        schema: 'syntax = "proto3";',
        references: [{ name: 'common.proto', subject: 'common', version: 2 }],
        metadata: { tags: { env: ['prod'] }, properties: { owner: 'orders' }, sensitive: ['owner'] },
        messageTypes: [{ name: 'Order' }],
      },
    ],
  } satisfies z.input<typeof subjectDetailsSchema>;
  expect(subjectDetailsSchema.parse(details)).toStrictEqual(details);
  expect(() =>
    subjectDetailsSchema.parse({ ...details, schemas: [{ ...details.schemas[0], references: 'common' }] })
  ).toThrow();
});

test('preserves unknown subject and context settings reported by the backend', () => {
  const unavailable = { mode: 'UNKNOWN', compatibility: 'UNKNOWN' } as const;
  const subject = {
    name: 'orders',
    type: 'AVRO',
    latestActiveVersion: 1,
    versions: [],
    schemas: [],
    ...unavailable,
  } satisfies z.input<typeof subjectDetailsSchema>;
  expect(subjectDetailsSchema.parse(subject)).toStrictEqual(subject);
  expect(parseRegistryContexts([{ name: '.orders', ...unavailable }])).toStrictEqual([
    { name: '.orders', ...unavailable },
  ]);
});

test('keeps valid references when a failed lookup returns null usages', () => {
  const valid = { schemaId: 2, usages: [{ subject: 'orders', version: 1 }] };
  expect(referencedBySchema.parse([{ schemaId: 0, error: 'lookup failed', usages: null }, valid])).toStrictEqual([
    { schemaId: 0, error: 'lookup failed', usages: [] },
    valid,
  ]);
});
