import { DEFAULT_CONTEXT_ID } from './schema-context-utils';
import {
  addVersionEditorState,
  computeMetadata,
  computeRecordName,
  computeSubjectName,
  deriveSchemaEditorState,
  type SchemaEditorStateData,
  subjectOptionsByContext,
} from './schema-create-state';
import { describe, expect, test } from 'bun:test';
import type { SchemaRegistryVersionedSchema } from '../../../state/rest-interfaces';

const AVRO_CAR = '{ "type": "record", "name": "car", "fields": [] }';
const PROTO_CAR = 'syntax = "proto3";\nmessage Car {\n  string make = 1;\n}';

const editorState = (overrides: Partial<SchemaEditorStateData> = {}): SchemaEditorStateData => ({
  strategy: 'TOPIC',
  userInput: '',
  keyOrValue: undefined,
  format: 'AVRO',
  schemaText: AVRO_CAR,
  references: [],
  normalize: false,
  metadataProperties: [],
  context: '',
  ...overrides,
});

const versionedSchema = (overrides: Partial<SchemaRegistryVersionedSchema> = {}): SchemaRegistryVersionedSchema => ({
  id: 7,
  version: 3,
  isSoftDeleted: false,
  type: 'AVRO',
  schema: AVRO_CAR,
  references: [],
  ...overrides,
});

describe('computeRecordName', () => {
  test.each([
    ['parsed Avro', editorState(), 'car'],
    ['incomplete JSON, by regex', editorState({ format: 'JSON', schemaText: '{ "name": "draft", ' }), 'draft'],
    ['a Protobuf message', editorState({ format: 'PROTOBUF', schemaText: PROTO_CAR }), 'Car'],
    ['no name at all', editorState({ format: 'PROTOBUF', schemaText: 'syntax = "proto3";' }), ''],
  ])('reads %s', (_label, state, name) => {
    expect(computeRecordName(state)).toBe(name);
  });
});

describe('computeSubjectName', () => {
  test.each([
    ['TOPIC', 'orders-value'],
    ['RECORD_NAME', 'car-value'],
    ['TOPIC_RECORD_NAME', 'orders-car-value'],
    ['CUSTOM', 'orders'],
  ] as const)('%s builds %s', (strategy, subjectName) => {
    expect(computeSubjectName(editorState({ strategy, userInput: 'orders', keyOrValue: 'VALUE' }))).toBe(subjectName);
  });

  test('adds no suffix before a key or value is picked', () => {
    expect(computeSubjectName(editorState({ userInput: 'orders' }))).toBe('orders');
  });
});

describe('computeMetadata', () => {
  test('keeps only complete properties', () => {
    expect(
      computeMetadata([
        { id: '1', key: 'owner', value: 'team-a' },
        { id: '2', key: 'empty', value: '' },
      ])
    ).toEqual({ properties: { owner: 'team-a' } });
    expect(computeMetadata([{ id: '1', key: '', value: '' }])).toBeUndefined();
  });
});

describe('deriveSchemaEditorState', () => {
  test('flags a topic subject without key or value and qualifies the name with its context', () => {
    const derived = deriveSchemaEditorState(editorState({ userInput: 'orders', context: '.staging' }));

    expect(derived.isInvalidKeyOrValue).toBe(true);
    expect(derived.computedSubjectName).toBe('orders');
    expect(derived.qualifiedSubjectName).toBe(':.staging:orders');
  });
});

describe('addVersionEditorState', () => {
  test('seeds a custom-named editor from the latest schema in its context', () => {
    const state = addVersionEditorState(
      ':.staging:orders-value',
      versionedSchema({
        references: [{ name: 'Car', subject: 'car', version: 1 }],
        metadata: { properties: { owner: 'team-a' } },
      }),
      true
    );

    expect(state).toMatchObject({
      strategy: 'CUSTOM',
      userInput: 'orders-value',
      context: '.staging',
      format: 'AVRO',
      references: [{ name: 'Car', subject: 'car', version: 1, context: '.staging' }],
    });
    expect(state.schemaText).toBe(JSON.stringify(JSON.parse(AVRO_CAR), undefined, 4));
    expect(state.metadataProperties.map(({ key, value }) => [key, value])).toEqual([
      ['owner', 'team-a'],
      ['', ''],
    ]);
  });

  test('keeps the full subject name and raw Protobuf text without context support', () => {
    const state = addVersionEditorState(
      ':.staging:orders-value',
      versionedSchema({ type: 'PROTOBUF', schema: PROTO_CAR }),
      false
    );

    expect(state).toMatchObject({ userInput: ':.staging:orders-value', context: '', schemaText: PROTO_CAR });
    expect(state.metadataProperties.map(({ key, value }) => [key, value])).toEqual([['', '']]);
  });
});

describe('subjectOptionsByContext', () => {
  test('groups subject display names by context id', () => {
    const grouped = subjectOptionsByContext([
      { name: 'orders-value', isSoftDeleted: false },
      { name: ':.staging:cars-value', isSoftDeleted: false },
    ]);

    expect(grouped.get(DEFAULT_CONTEXT_ID)).toEqual([{ value: 'orders-value' }]);
    expect(grouped.get('.staging')).toEqual([{ value: 'cars-value' }]);
  });
});
