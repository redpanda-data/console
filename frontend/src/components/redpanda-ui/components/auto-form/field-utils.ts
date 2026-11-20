import { isValidElement } from 'react';
import type { ParsedField, Renderable } from '../../lib/form-types';
import { hasSlotContent } from '../../lib/has-slot-content';

// Canonical casing for acronyms title-casing would otherwise mangle ("Api"
// → "API"). gRPC is intentionally lower-case `g`. Matched as whole words.
const ACRONYMS: Record<string, string> = {
  api: 'API',
  aws: 'AWS',
  dsn: 'DSN',
  gcp: 'GCP',
  grpc: 'gRPC',
  http: 'HTTP',
  https: 'HTTPS',
  id: 'ID',
  json: 'JSON',
  jwt: 'JWT',
  mcp: 'MCP',
  oauth: 'OAuth',
  sasl: 'SASL',
  sdk: 'SDK',
  sns: 'SNS',
  sql: 'SQL',
  sqs: 'SQS',
  ssl: 'SSL',
  tls: 'TLS',
  tts: 'TTS',
  url: 'URL',
  uri: 'URI',
  uuid: 'UUID',
  vpc: 'VPC',
  yaml: 'YAML',
};

function applyAcronyms(label: string): string {
  return label.replace(/\b[A-Za-z]+\b/g, (word) => ACRONYMS[word.toLowerCase()] ?? word);
}

function beautifyLabel(label: string): string {
  if (label === '') {
    return '';
  }
  let output = label.replace(/([A-Z])/g, ' $1');
  output = output.charAt(0).toUpperCase() + output.slice(1);
  if (!Number.isNaN(Number(output))) {
    return '';
  }
  if (output === '*') {
    return '';
  }
  return applyAcronyms(output);
}

export function getLabel(field: ParsedField): Renderable {
  for (const label of [field.fieldConfig?.label, field.description]) {
    if (hasSlotContent(label)) {
      return label;
    }
  }
  return beautifyLabel(field.key);
}

/** Textual labels for matching, search and ARIA; never coerce a React element to an object string. */
export function getRenderableText(value: unknown, fallback = ''): string {
  const text = renderedText(value).trim();
  return text === '' ? fallback : text;
}

function renderedText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((child: unknown) => renderedText(child)).join('');
  }
  if (isValidElement(value)) {
    const props: unknown = value.props;
    return typeof props === 'object' && props !== null && 'children' in props ? renderedText(props.children) : '';
  }
  return '';
}

export function sortFieldsByOrder(fields: ParsedField[] | undefined): ParsedField[] {
  if (fields === undefined) {
    return [];
  }
  return fields
    .map((field) => (field.schema === undefined ? field : { ...field, schema: sortFieldsByOrder(field.schema) }))
    .sort((a, b) => (a.fieldConfig?.order ?? 0) - (b.fieldConfig?.order ?? 0));
}

export function getPathInObject(obj: object, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      return;
    }
    current = Reflect.get(current, key);
  }
  return current;
}
