import { buildQualifiedSubjectName, contextNameToId, parseSubjectContext } from './schema-context-utils';
import {
  type SchemaRegistrySubject,
  type SchemaRegistryVersionedSchema,
  SchemaType,
} from '../../../state/rest-interfaces';

// Regex for extracting record names from schema text
const JSON_NAME_REGEX = /"name"\s*:\s*"(.*)"/;
const PROTOBUF_MESSAGE_NAME_REGEX = /message\s+(\S+)\s*\{/;

export type NamingStrategy =
  | 'TOPIC' // only topic name
  | 'RECORD_NAME' // take name from the record
  | 'TOPIC_RECORD_NAME' // both topic and record name
  | 'CUSTOM'; // essentially no strategy / arbitrary name

export type SchemaEditorStateData = {
  strategy: NamingStrategy;
  userInput: string; // holds either topicName or custom input
  keyOrValue: 'KEY' | 'VALUE' | undefined;
  format: 'AVRO' | 'PROTOBUF' | 'JSON';
  schemaText: string;
  references: { id: string; name: string; subject: string; version: number; context: string }[];
  normalize: boolean;
  metadataProperties: { id: string; key: string; value: string }[];
  context: string;
};

export type SchemaEditorStateHelper = SchemaEditorStateData & {
  computedMetadata: { properties: Record<string, string> } | undefined;
  isInvalidKeyOrValue: boolean;
  computedSubjectName: string;
  qualifiedSubjectName: string;
};

// The record name `regex` captures from the schema text, or '' when it doesn't match.
function matchRecordName(schemaText: string, regex: RegExp): string {
  const ar = regex.exec(schemaText);
  if (!ar) {
    return '';
  }
  if (ar.length < 2) {
    return '';
  }
  return ar[1];
}

// Avro and JSON schemas carry the record name in a top-level `name` field.
function jsonRecordName(schemaText: string): string {
  try {
    const { name } = JSON.parse(schemaText);
    return name;
  } catch {
    // no op - schema may be incomplete during editing
  }
  return matchRecordName(schemaText, JSON_NAME_REGEX);
}

export function computeRecordName(state: SchemaEditorStateData): string {
  if (state.format === 'AVRO' || state.format === 'JSON') {
    return jsonRecordName(state.schemaText);
  }
  return matchRecordName(state.schemaText, PROTOBUF_MESSAGE_NAME_REGEX);
}

// The subject name each naming strategy builds, before the key/value suffix.
const SUBJECT_NAME_BY_STRATEGY: Record<NamingStrategy, (userInput: string, recordName: string) => string> = {
  TOPIC: (userInput) => userInput,
  RECORD_NAME: (_userInput, recordName) => recordName,
  TOPIC_RECORD_NAME: (userInput, recordName) => `${userInput}-${recordName}`,
  CUSTOM: (userInput) => userInput,
};

export function computeSubjectName(state: SchemaEditorStateData): string {
  const subjectName = SUBJECT_NAME_BY_STRATEGY[state.strategy](state.userInput, computeRecordName(state));
  if (state.strategy !== 'CUSTOM' && state.keyOrValue !== undefined && subjectName) {
    return `${subjectName}-${state.keyOrValue.toLowerCase()}`;
  }
  return subjectName;
}

// Metadata to register: the properties with both a key and a value, or undefined when there are none.
export function computeMetadata(
  metadataProperties: SchemaEditorStateData['metadataProperties']
): SchemaEditorStateHelper['computedMetadata'] {
  const properties: Record<string, string> = {};
  for (const prop of metadataProperties) {
    if (prop.key && prop.value) {
      properties[prop.key] = prop.value;
    }
  }
  return Object.keys(properties).length > 0 ? { properties } : undefined;
}

export function deriveSchemaEditorState(state: SchemaEditorStateData): SchemaEditorStateHelper {
  const subjectName = computeSubjectName(state);
  return {
    ...state,
    computedMetadata: computeMetadata(state.metadataProperties),
    isInvalidKeyOrValue: state.strategy === 'TOPIC' && state.userInput.length > 0 && !state.keyOrValue,
    computedSubjectName: subjectName,
    qualifiedSubjectName: buildQualifiedSubjectName(state.context, subjectName),
  };
}

// Splits a subject name into its context id and the name typed in the editor.
function subjectNameParts(subjectName: string, srContextsEnabled: boolean) {
  if (!srContextsEnabled) {
    return { contextId: '', userInput: subjectName };
  }
  const parsed = parseSubjectContext(subjectName);
  return { contextId: contextNameToId(parsed.context), userInput: parsed.displayName };
}

// The schema's metadata as editable rows, plus a trailing empty row to type into.
function metadataRows(schema: SchemaRegistryVersionedSchema): SchemaEditorStateData['metadataProperties'] {
  const emptyRow = { id: crypto.randomUUID(), key: '', value: '' };
  if (!schema.metadata?.properties) {
    return [emptyRow];
  }
  return [
    ...Object.entries(schema.metadata.properties).map(([key, value]) => ({ id: crypto.randomUUID(), key, value })),
    emptyRow,
  ];
}

// Editor state for adding a version to `subjectName`, seeded from its latest active schema.
export function addVersionEditorState(
  subjectName: string,
  schema: SchemaRegistryVersionedSchema,
  srContextsEnabled: boolean
): SchemaEditorStateData {
  const schemaText =
    schema.type === SchemaType.AVRO || schema.type === SchemaType.JSON
      ? JSON.stringify(JSON.parse(schema.schema), undefined, 4)
      : schema.schema;
  const { contextId, userInput } = subjectNameParts(subjectName, srContextsEnabled);
  return {
    strategy: 'CUSTOM',
    userInput,
    keyOrValue: undefined,
    format: schema.type as 'AVRO' | 'PROTOBUF',
    schemaText,
    references: schema.references.map((r) => ({ ...r, id: crypto.randomUUID(), context: contextId })),
    normalize: false,
    metadataProperties: metadataRows(schema),
    context: contextId,
  };
}

// Display names of subjects per context id, for the reference subject picker.
export function subjectOptionsByContext(subjects: SchemaRegistrySubject[]): Map<string, { value: string }[]> {
  const map = new Map<string, { value: string }[]>();
  for (const s of subjects) {
    const parsed = parseSubjectContext(s.name);
    const key = contextNameToId(parsed.context);
    const list = map.get(key) ?? [];
    list.push({ value: parsed.displayName });
    map.set(key, list);
  }
  return map;
}
