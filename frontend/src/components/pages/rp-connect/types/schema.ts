import type { ComponentSpec, ComponentStatus, FieldSpec } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

export interface RawFieldSpec extends Omit<FieldSpec, 'children'> {
  children?: RawFieldSpec[];
  comment?: string; // Keep for internal use (YAML generation)
  /**
   * Stamped by enrichComponentsWithConfigSchema from the schema's `required` arrays, which the
   * backend computes with full default knowledge (the proto drops non-string defaults, making
   * "required" indistinguishable from "default lost in serialization"). Undefined when the
   * schema carries no `required` arrays; consumers then fall back to proto flags.
   */
  requiredBySchema?: boolean;
  /**
   * Stamped by enrichComponentsWithConfigSchema from the raw config-schema JSON — the proto
   * FieldSpec has no is_secret field at all. Undefined when the dataplane's schema predates
   * flag serialization (benthos < 4.59); consumers then fall back to the name heuristic.
   */
  secret?: boolean;
}

export const CONNECT_COMPONENT_TYPE = [
  'buffer',
  'cache',
  'input',
  // Configures how Benthos instance metrics (performance, counts, etc.) are exposed or sent.
  'metrics',
  'output',
  'processor',
  'rate_limit',
  'tracer',
  'scanner',
  'tracer',
  'custom',
] as const satisfies readonly ComponentSpec['type'][];

export type ConnectComponentType = (typeof CONNECT_COMPONENT_TYPE)[number];

export const CONNECT_FIELD_TYPE = [
  'string', // A textual string value. Example: "hello world"
  'int', // An integer number. Example: 1024
  'float', // A floating-point number. Example: 3.14
  'bool', // A boolean value (true or false). Example: true
  'object', // A structured object with nested fields. Example: { "foo": "bar", "nested": { "a": 1 } }
  'unknown', // The type is not strictly defined or can vary dynamically.

  'input',
  'buffer',
  'cache',
  'processor',
  'rate_limit',
  'output',
  'metrics',
  'tracer',
  'scanner',
] as const;

export type ConnectFieldType = (typeof CONNECT_FIELD_TYPE)[number] | (string & {});

export const CONNECT_FIELD_KIND = [
  'scalar',
  // Example: `urls: ["http://localhost:4195", "http://localhost:4196"]` (Array of Strings)
  'array',
  '2darray',
  'map',
] as const;

export type ConnectFieldKind = (typeof CONNECT_FIELD_KIND)[number] | (string & {});

export const CONNECT_VALUE_TYPE = [
  'String', // A textual string value in Bloblang. Example: `"hello world"`
  'Number', // A numeric value (can be an integer or floating-point). Example: `42`, `3.14`
  'Bool', // A boolean value. Example: `true`, `false`
  'Timestamp', // A timestamp representing a specific moment in time.
  'Array', // An array (list) of values. Example: `["a", "b", "c"]`
  'Object', // A structured object (map) of key-value pairs. Example: `{ "key": "value" }`
  'Null', // The special null value indicating the absence of a value.
  'Unknown', // The type is not strictly defined or the function/method accepts any type.
  'Query', // A Bloblang query expression that is evaluated dynamically.
] as const;

export type ConnectValueType = (typeof CONNECT_VALUE_TYPE)[number] | (string & {});

export interface ConnectComponentSpec extends Omit<ComponentSpec, 'type' | 'status'> {
  logoUrl?: string; // UI-specific field
  status: ComponentStatus;
  type: ConnectComponentType;
}

/**
 * Extended component spec with additional UI-specific metadata like external docs and logos
 */
export type ExtendedConnectComponentSpec = ConnectComponentSpec & {
  externalDocs?: {
    primaryUrl?: string;
    secondaryUrl?: string;
    format?: 'markdown' | 'asciidoc';
    logoUrl?: string;
  };
};

export type ConnectConfigKey =
  | 'input'
  | 'output'
  | 'pipeline'
  | 'cache_resources'
  | 'buffer'
  | 'rate_limit_resources'
  | 'scanner'
  | 'metrics'
  | 'tracer'
  | 'scanner'
  | 'redpanda'; // Top-level block for redpanda_common components

export type ConnectConfigObject = Record<ConnectConfigKey, unknown>;
