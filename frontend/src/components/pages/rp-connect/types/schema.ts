import type { ComponentSpec, ComponentStatus, FieldSpec } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

// RawFieldSpec matches proto FieldSpec structure
export interface RawFieldSpec extends Omit<FieldSpec, 'children'> {
  comment?: string; // Keep for internal use (YAML generation)
  children?: RawFieldSpec[];
}

export const CONNECT_COMPONENT_TYPE = [
  // Buffers messages, often used between inputs/outputs and processing stages
  // to decouple components, absorb temporary load spikes, or ensure message persistence.
  // Example: `memory`, `none`.
  'buffer',
  // Provides a key-value store for caching data, often used by processors
  // for lookups or by rate limits for state.
  // Example: `redis`, `memory`.
  'cache',
  // Consumes data from external sources (e.g., message queues, files, HTTP endpoints).
  // This is the entry point for data into a Benthos pipeline.
  // Example: `kafka`, `http_server`, `file`.
  'input',
  // Configures how Benthos instance metrics (performance, counts, etc.) are exposed or sent.
  // Example: `prometheus`, `statsd`.
  'metrics',
  // Sends data to external systems or sinks (e.g., message queues, databases, HTTP endpoints).
  // This is the exit point for data from a Benthos pipeline.
  // Example: `kafka`, `http_client`, `s3`.
  'output',
  // Transforms, filters, enriches, or routes messages as they flow through a pipeline.
  // Example: `bloblang`, `json`, `switch`.
  'processor',
  // Enforces rate limits on operations, typically used to prevent overloading downstream services
  // or to adhere to API quotas.
  // Example: `local`, `redis`.
  'rate_limit',
  // Configures distributed tracing for monitoring message flow across Benthos and other services.
  // Example: `jaeger`, `open_telemetry_collector`.
  'tracer',
  // Defines how a raw stream of bytes (e.g., from a file or network connection)
  // should be broken down into individual messages. Often used within input components.
  // Example: `lines`, `csv`, `tar`.
  'scanner',
  'tracer',
  // used exclusively for skipping the wizard
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

  // Core component types. These indicate that the field's value is itself
  // a configuration for another Benthos component of the specified type.
  // For example, a field with `type: FieldType.Input` expects a full input component
  // configuration as its value, e.g., `{ "kafka": { "addresses": [...] } }`.
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

// FieldKind represents the structural nature of a configuration field.
export const CONNECT_FIELD_KIND = [
  // A single, scalar value. This could be a simple primitive (string, int, bool)
  // or a single object representing a component configuration.
  'scalar',
  // An ordered list (array) of values, where all values are of the same `FieldType`.
  // Example: `urls: ["http://localhost:4195", "http://localhost:4196"]` (Array of Strings)
  // Example: `processors: [{ "bloblang": "..." }, { "log": "..." }]` (Array of Processor Objects)
  'array',
  // A list of lists (an array of arrays).
  // Example: `output_batches: [[{ "content_equals": "foo" }], [{ "content_equals": "bar" }]]`
  '2darray',
  // A key-value map, where keys are strings and values are of the same `FieldType`.
  // Example: `meta: { "key1": "value1", "key2": "value2" }` (Map of Strings)
  'map',
] as const;

export type ConnectFieldKind = (typeof CONNECT_FIELD_KIND)[number] | (string & {});

// ValueType specifies the data type of a Bloblang value, typically for function/method parameters or results.
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
  type: ConnectComponentType;
  status: ComponentStatus;
  logoUrl?: string; // UI-specific field
}

/**
 * Extended component spec with additional UI-specific metadata like external docs and logos
 */
export type ExtendedConnectComponentSpec = ConnectComponentSpec & {
  // External documentation URLs and metadata for components from external sources
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
