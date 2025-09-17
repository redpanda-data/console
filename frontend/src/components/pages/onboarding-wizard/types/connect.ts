// Represents the stability status of a Benthos component or feature.
export const COMPONENT_STATUS = [
  // The component/feature is considered stable and recommended for production use.
  // Breaking changes are highly unlikely.
  'stable',
  // The component/feature is in beta. It's largely complete and functional
  // but may have some bugs or undergo minor breaking changes before becoming stable.
  'beta',
  // The component/feature is experimental. It's subject to significant changes
  // or removal in future versions. Use with caution and expect potential instability or breaking changes.
  'experimental',
  // The component/feature is deprecated and will be removed in a future version.
  // It should be avoided in new configurations and migrated away from in existing ones.
  'deprecated',
] as const;

export type KnownComponentStatus = (typeof COMPONENT_STATUS)[number];

export type ComponentStatus = (typeof COMPONENT_STATUS)[number] | (string & {});

// Categorizes the primary function of a Benthos component within a pipeline.
export const COMPONENT_TYPE = [
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
] as const;

export type ComponentType = (typeof COMPONENT_TYPE)[number] | (string & {});

// FieldType represents the data type of a configuration field.
export const FIELD_TYPE = [
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

export type FieldType = (typeof FIELD_TYPE)[number] | (string & {});

// FieldKind represents the structural nature of a configuration field.
export const FIELD_KIND = [
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

export type FieldKind = (typeof FIELD_KIND)[number] | (string & {});

// AnnotatedExample provides a documented, illustrative configuration snippet for a component.
export interface AnnotatedExample {
  // A concise title for the example, summarizing its purpose.
  // Example: "Reading JSON from Kafka and Writing to S3"
  title: string;

  // A brief summary explaining what the example demonstrates or achieves.
  summary: string;

  // A YAML or JSON configuration snippet showcasing the component's usage in this example.
  config: string;
}

// FieldSpec describes the specification for a single field within a Benthos component's configuration.
export interface FieldSpec<T = unknown> {
  // The name of the field as it appears in the configuration (e.g., `address`, `batch_policy`).
  name: string;

  // The data type expected for this field's value.
  type: FieldType;

  // The structural kind of this field (e.g., a single value, a list, a map).
  kind: FieldKind;

  // A detailed explanation of the field's purpose, behavior, and accepted values, in Asciidoc format.
  // This is the primary documentation for the field.
  description?: string;

  // If true, this field is considered an advanced option. Advanced fields are typically
  // optional and used for less common or more fine-grained configurations.
  // UIs might hide these by default or place them in an "Advanced" section.
  is_advanced?: boolean;

  // If true, this field is deprecated. It still exists for backward compatibility
  // but should be avoided in new configurations and may be removed in a future version.
  is_deprecated?: boolean;

  // If true, this field is optional, even if it doesn't have a `default` value.
  // This flag helps prevent linting errors when the field is legitimately omitted by the user.
  // It signifies that Benthos can operate correctly without this field being explicitly set.
  is_optional?: boolean;

  // If true, this field is expected to contain sensitive information such as passwords, API keys,
  // or access tokens. UIs might mask or handle this field specially, and values might be scrubbed from logs.
  is_secret?: boolean;

  // The default value that Benthos will use for this field if it's not specified in the configuration.
  // The type of this value will match the field's `type` and `kind`.
  // Example: `true` for a boolean, `[]` for an array, `""` for a string, or an empty object `{}` for a component.
  default?: T;

  // If true, this field supports Bloblang function interpolation. This allows dynamic values
  // to be inserted into the field using expressions like `${!timestamp_unix()}` or `${!json("foo.bar")}`.
  interpolated?: boolean;

  // If true, this field (which must be of type `String`) is expected to contain a Bloblang mapping.
  // The string content itself will be parsed and executed as a Bloblang script.
  // Example: `root = this.uppercase()`
  bloblang?: boolean;

  // A list of optional example values for this field, illustrating valid inputs.
  // The type of elements in this array depends on the field's `type` and `kind`.
  // Example: For a string field, `["example_value1", "another_example"]`.
  examples?: T[];

  // For string fields that accept a predefined set of values (enum-like), this provides
  // a list of those options, each with a corresponding summary/description.
  // Example: `[["option_a", "Enables feature A"], ["option_b", "Enables feature B"]]`.
  annotated_options?: Array<[string, string]>;

  // For string fields that accept a predefined set of values (enum-like), this provides
  // a list of those possible string values when detailed summaries are not needed.
  // Example: `["value1", "value2", "value3"]`.
  options?: string[];

  // For fields of `type: FieldType.Object`, this array describes the specifications
  // of its nested child fields.
  children?: FieldSpec[];

  // The Benthos version (e.g., "3.45.0") in which this specific field was introduced or significantly changed.
  version?: string;

  // An optional Bloblang mapping used to lint (validate) the value of this field.
  // The mapping should evaluate to an error message (string or array of strings) if validation fails,
  // or to `null` or `deleted()` if the value is valid.
  // This is used by linters to check configuration correctness.
  linter?: string;

  // An optional Bloblang mapping used to scrub (redact or hide) sensitive information
  // from this field's value when it's displayed (e.g., in logs, API responses, or UI).
  // It should transform the value to a redacted form (e.g., "!!!SECRET_SCRUBBED!!!") if it's sensitive.
  scrubber?: string;
}

// ComponentSpec describes the full specification of a Benthos component (e.g., an input, processor, output).
export interface ComponentSpec {
  // The unique, machine-readable name of the component (e.g., `aws_s3`, `kafka`, `json_parser`).
  // This name is used in the configuration file to specify the component type.
  name: string;

  // Type of the component (input, output, etc)
  type: ComponentType;

  // Stability status: "stable", "beta", "experimental", or "deprecated".
  status: ComponentStatus;

  // An abstract representation of the component's support level. This can vary (e.g., "community",
  // "enterprise", "core") and might influence how it's displayed or prioritized by tooling.
  support_level?: string;

  // Always true for components that are dynamically loadable as plugins. False for built-in components
  // that are not separable as plugins.
  plugin: boolean;

  // A brief, one-sentence summary of the component's purpose, in Asciidoc format.
  // Should be concise and quickly convey what the component does.
  // Example: "Reads messages from one or more Kafka topics."
  summary?: string;

  // A more detailed description of the component, its behavior, common use cases, and important
  // considerations, in Asciidoc format. This forms the main part of the component's documentation.
  description?: string;

  // Optional tags or categories for UI grouping or filtering.
  // Example: `["Services", "AWS"]` or `["Utility"]`. Can be `null` if not categorized.
  categories: string[] | null;

  // Additional notes, disclaimers, or important information related to the component that doesn't
  // fit into the main `description`, in Asciidoc format.
  footnotes?: string;

  // Examples demonstrating use cases for the component.
  examples?: AnnotatedExample[];

  // A summary of each field in the component configuration.
  config: FieldSpec;

  // Version is the Benthos version this component was introduced.
  version?: string;
}

// ✅ NEW: Extended ComponentSpec for external connections (Phase 2)
export interface ExtendedComponentSpec extends ComponentSpec {
  // External documentation
  externalDocs?: {
    primaryUrl?: string;
    secondaryUrl?: string;
    format?: 'markdown' | 'asciidoc';
    logoUrl?: string;
  };
}

// Describes a Bloblang function, which is a named operation that can be called within a Bloblang mapping.
// Example functions: `batch_index()`, `env("VAR_NAME")`, `uuid_v4()`.
export interface BloblangFunctionSpec {
  // The release status of the function, indicating its stability and readiness for use.
  status: ComponentStatus;

  // A high-level grouping for the function, used for organizing documentation or UI elements.
  // Example: "Message Info", "String Manipulation", "Environment Variables".
  category: string;

  // Name of the function (as it appears in config), e.g. "count".
  name: string;

  // Description of the functions purpose (in markdown).
  description?: string;

  // Params defines the expected arguments of the function. Either:
  // - { variadic: true } // no named params, unlimited positional
  // - { named: [ … ] } // an array of named parameter definitions
  params: BloblangParams;

  // Examples shows general usage for the function.
  examples?: ExampleSpec[];

  // If true, this function may perform side effects (e.g., reading a file with `file()`,
  // accessing environment variables with `env()`) or depend on external, mutable state.
  // If false, the function is pure, meaning its output depends solely on its inputs and it has no side effects.
  impure: boolean;

  // Version is the Benthos version this component was introduced.
  version?: string;
}

// ValueType specifies the data type of a Bloblang value, typically for function/method parameters or results.
export const VALUE_TYPE = [
  'string', // A textual string.
  'bytes', // A sequence of raw bytes.
  'number', // A numeric value, which can be an integer or a float.
  'bool', // A boolean value (true or false).
  'timestamp', // A specific point in time, often represented internally as a Go `time.Time`.
  'array', // An ordered list of Bloblang values.
  'object', // A collection of key-value pairs, where keys are strings and values are Bloblang values.
  'null', // Represents a JSON null value.
  'delete', // A special type indicating that a field should be removed from its parent object during mapping.
  'nothing', // Represents the absence of a value, distinct from null. Often used to conditionally omit fields or signal a non-match.
  'query expression', // A Bloblang expression or mapping itself, which can be evaluated.
  'unknown', // The type is not determined or can vary.
  'integer', // A whole number (a more specific form of `TNumber`).
  'float', // A floating-point number (a more specific form of `TNumber`).
] as const;

export type ValueType = (typeof VALUE_TYPE)[number] | (string & {});

// Describes a single named parameter for a Bloblang function or method.
export interface BloblangParam {
  // The identifier for the parameter as used in named parameter calls (e.g., `path`, `min`, `max`).
  name: string;

  // A description of what the parameter is used for and its expected behavior.
  description?: string;

  // The expected Bloblang data type for this parameter's value.
  type: ValueType;

  // If true, the value provided for this parameter must be a literal (static value) and
  // cannot be a dynamic Bloblang expression that needs to be evaluated.
  // If false (default), dynamic expressions are allowed.
  no_dynamic: boolean;

  // If true, any scalar literal (numbers, booleans) passed to this parameter will be
  // directly converted to its primitive literal type (e.g., a Bloblang number remains a number object).
  // If false, they might be wrapped in a generic Bloblang "Value" type.
  scalars_to_literal: boolean;

  // If true, this parameter is optional; callers do not have to specify it.
  // If false or omitted, it is required.
  is_optional?: boolean;

  // The default value to use if this optional parameter is not provided by the caller.
  // The type of this `default` value should be consistent with the parameter's `type`.
  // If absent, there is no default value.
  default?: unknown;
}

// BloblangParams defines the expected arguments of a function or method.
export interface BloblangParams {
  // If true, this function/method accepts an arbitrary number of unnamed arguments (variadic).
  // Example: `foo(1, "bar", true)` where `foo` is variadic.
  variadic?: boolean;

  // If `variadic` is false and this list is present, it defines the named, typed parameters
  // that the function/method accepts. These are typically passed in `key: value` form if multiple
  // exist, or positionally if only one.
  // Example: `foo(name: "bar", age: 7)` or `bar("single_arg")`.
  named?: BloblangParam[];
}

// Describes a Bloblang method (e.g. “map_each”, “join”, “upper_case”).
// Methods are invoked on a value (e.g. `this.some_field.uppercase()`).
export interface BloblangMethodSpec {
  // The release status of the function.
  status: ComponentStatus;

  // Name of the method (as it appears in config), for examples "abs", "all" or "apply".
  name: string;

  // Description of the method purpose (in markdown).
  description?: string;

  // Describes this method’s parameters, in the same shape as functions:
  // either variadic or a list of named params.
  params: BloblangParams;

  // Examples shows general usage for the method.
  examples?: ExampleSpec[];

  // Categories that this method fits within.
  categories?: MethodCatSpec[];

  // When true, this function may perform side effects or depend on external
  // state (e.g. reading files, environment variables). When false, it’s pure.
  impure: boolean;

  // Version is the Benthos version this component was introduced.
  version?: string;
}

// MethodCatSpec describes how a Bloblang method behaves in the context of a specific
// data type category (e.g., when the method is called on a string, an array, or a number).
export interface MethodCatSpec {
  // The name of the data type category this specification applies to (e.g., "Strings", "Arrays", "Numbers").
  category: string;
  // A description of how the method functions and what it returns when applied to values of this category.
  description: string;
  // Examples specific to this method's usage within this particular data type category.
  examples?: ExampleSpec[];
}

// ExampleSpec provides a general example for a Bloblang function or method,
// showing input, the mapping/expression, and the expected output.
export interface ExampleSpec {
  // An example input value that would be provided to the Bloblang mapping, function, or method.
  input?: unknown;

  // The expected output value that results from applying the `mapping` to the `input`.
  output?: unknown;

  // The Bloblang mapping, function call, or method invocation being demonstrated.
  // This is the core of the example.
  mapping?: string;

  // An optional description of what this specific example aims to illustrate or highlight.
  description?: string;
}

/**
 * PipelineRoot represents the root structure of the Benthos (Redpanda Connect) documentation manifest.
 * This manifest contains all specifications for components, Bloblang features,
 * and global configuration fields for a specific Benthos version. It serves as a comprehensive
 * schema for understanding and validating Benthos configurations.
 */
export interface PipelineRoot {
  // The Benthos version this manifest corresponds to. Example: `4.55.1`.
  version: string;
  // The UTC date and time when this manifest was generated. Example: `2025-05-19T16:27:47Z`.
  date: string;
  /**
   * Specifications for the top-level Benthos configuration fields. These define the main
   * sections of a Benthos configuration file, such as `http` (for the HTTP server),
   * `input`, `buffer`, `pipeline` (containing processors), `output`, `logger`, `metrics`, `tracer`,
   * and various resource sections (`*_resources`). Each item in the array is a `FieldSpec`
   * describing one of these global configuration blocks. A typical Benthos configuration
   * will include a subset of these top-level fields.
   */
  config: FieldSpec[];
  /**
   * A list of specifications for all available Buffer components.
   * Buffers are used in Benthos to store messages temporarily between stages,
   * providing resilience against backpressure or transient failures. A Benthos pipeline
   * typically has one main buffer defined under the top-level `buffer` field in the config.
   * Additional buffers can be defined as resources.
   * This array lists all types of buffers (e.g., `memory`, `none`, `sqlite`) and their configurations.
   */
  buffers?: ComponentSpec[];
  /**
   * A list of specifications for all available Cache components.
   * Caches provide a key-value store that can be used by various Benthos components,
   * particularly processors (e.g., for deduplication, enrichment) or rate limits.
   * Caches are typically defined in the `cache_resources` section of the configuration
   * and then referenced by their label. This array lists all types of caches
   * (e.g., `redis`, `memory`, `s3`) and their configurations.
   */
  caches?: ComponentSpec[];
  /**
   * A list of specifications for all available Input components.
   * Inputs are responsible for consuming data from external sources. A Benthos configuration
   * typically defines one main input under the top-level `input` field. Multiple inputs
   * can be combined using a `broker` input or defined as resources in `input_resources`.
   * This array lists all types of inputs (e.g., `kafka`, `http_server`, `file`, `s3`)
   * and their configurations.
   */
  inputs?: ComponentSpec[];
  /**
   * A list of specifications for all available Output components.
   * Outputs are responsible for sending processed data to external destinations. A Benthos
   * configuration typically defines one main output under the top-level `output` field.
   * Multiple outputs can be used via a `broker` output or defined as resources in `output_resources`.
   * This array lists all types of outputs (e.g., `kafka`, `http_client`, `s3`, `stdout`)
   * and their configurations.
   */
  outputs?: ComponentSpec[];
  /**
   * A list of specifications for all available Processor components.
   * Processors are used to transform, filter, enrich, or route messages as they flow
   * through the pipeline. They are defined within the `pipeline.processors` array or
   * as resources in `processor_resources`. This array lists all types of processors
   * (e.g., `bloblang`, `json`, `log`, `switch`) and their configurations.
   */
  processors?: ComponentSpec[];
  /**
   * A list of specifications for all available Metrics components.
   * Metrics components configure how Benthos instance metrics (e.g., message counts,
   * latencies, component statuses) are exposed or sent to monitoring systems. A Benthos
   * configuration typically has one main metrics component defined under the top-level
   * `metrics` field. This array lists all types of metrics components (e.g., `prometheus`,
   * `statsd`, `aws_cloudwatch`) and their configurations.
   */
  metrics?: ComponentSpec[];
  /**
   * A list of specifications for all available Tracer components.
   * Tracers configure distributed tracing, allowing users to monitor the flow of messages
   * across Benthos and other instrumented services. A Benthos configuration typically
   * has one main tracer defined under the top-level `tracer` field. This array lists
   * all types of tracers (e.g., `jaeger`, `open_telemetry_collector`, `none`)
   * and their configurations.
   */
  tracers?: ComponentSpec[];
  /**
   * A list of specifications for all available Scanner components.
   * Scanners define how a raw stream of bytes (e.g., from a file or network connection)
   * is broken down into individual messages. They are often used within specific input
   * components that handle unstructured or delimited data. This array lists all types
   * of scanners (e.g., `lines`, `csv`, `tar`, `decompress`) and their configurations.
   */
  scanners?: ComponentSpec[];
  /**
   * A list of specifications for all available Rate Limit components.
   * Rate limits are used to control the frequency of operations, helping to prevent
   * overloading downstream services or to adhere to API quotas. Rate limits are
   * typically defined in the `rate_limit_resources` section of the configuration
   * and then referenced by other components. This array lists all types of rate limits
   * (e.g., `local`, `redis`) and their configurations.
   * Note: The key in the source JSON is "rate-limits".
   */
  'rate-limits'?: ComponentSpec[];
  /**
   * A list of specifications for all available built-in Bloblang functions.
   * Bloblang is Benthos's powerful data mapping and transformation language. This
   * array details each standard function, its parameters, and usage.
   * Note: The key in the source JSON is "bloblang-functions".
   */
  'bloblang-functions'?: BloblangFunctionSpec[];
  /**
   * A list of specifications for all available built-in Bloblang methods.
   * Methods in Bloblang are functions that are called on a context value (e.g., `this.field.uppercase()`).
   * This array details each standard method, its parameters, and usage.
   * Note: The key in the source JSON is "bloblang-methods".
   */
  'bloblang-methods'?: BloblangMethodSpec[];
}

export interface NodeCategory {
  id: string;
  name: string;
  components: ComponentSpec[];
}

export interface SchemaNodeConfig {
  id: string;
  name: string;
  type: string;
  category: ComponentType;
  status: ComponentStatus;
  summary?: string;
  description?: string;
  config: ComponentSpec['config'];
  categories?: string[] | null;
  version?: string;
}

// JSON Schema interfaces for parsing the actual schema file
export interface JsonSchemaProperty {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  $ref?: string;
}

export interface JsonSchema {
  definitions?: Record<string, JsonSchemaProperty>;
  properties?: Record<string, JsonSchemaProperty>;
}

export type BaseConfig = Record<string, Record<string, unknown>>;
