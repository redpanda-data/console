import type { ParsedField } from '../../lib/form-types';

// Common protocol / tech acronyms the default title-casing would
// otherwise emit as mixed-case ("Api Key", "Tls", "Aws Region", etc.).
// The replacement is the canonical form the industry uses — gRPC is
// intentionally lower-case `g`, everything else is fully upper.
// Matched as whole words (case-insensitive) after the initial
// camelCase/snake_case split in `beautifyLabel`.
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
  if (!label) {
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

export function getLabel(field: ParsedField): string {
  return (field.fieldConfig?.label as string) || (field.description as string) || beautifyLabel(field.key);
}

export function sortFieldsByOrder(fields: ParsedField[] | undefined): ParsedField[] {
  if (!fields) {
    return [];
  }
  return fields
    .map((field) => (field.schema ? { ...field, schema: sortFieldsByOrder(field.schema) } : field))
    .sort((a, b) => (a.fieldConfig?.order ?? 0) - (b.fieldConfig?.order ?? 0));
}

export function getPathInObject(obj: Record<string, unknown>, path: string[]): any {
  let current: unknown = obj;
  for (const key of path) {
    if (current === undefined || current === null) {
      return;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
