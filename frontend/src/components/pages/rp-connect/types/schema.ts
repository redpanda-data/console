import type { ComponentSpec, ComponentStatus, FieldSpec } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

/**
 * Comment text is retained for YAML generation.
 */
export interface RawFieldSpec extends Omit<FieldSpec, 'children'> {
  children?: RawFieldSpec[];
  comment?: string;
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
  'string',
  'int',
  'float',
  'bool',
  'object',
  'unknown',

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

export const CONNECT_FIELD_KIND = ['scalar', 'array', '2darray', 'map'] as const;

export type ConnectFieldKind = (typeof CONNECT_FIELD_KIND)[number] | (string & {});

export const CONNECT_VALUE_TYPE = [
  'String',
  'Number',
  'Bool',
  'Timestamp',
  'Array',
  'Object',
  'Null',
  'Unknown',
  'Query',
] as const;

export type ConnectValueType = (typeof CONNECT_VALUE_TYPE)[number] | (string & {});

/**
 * The logo URL is UI metadata rather than a config value.
 */
export interface ConnectComponentSpec extends Omit<ComponentSpec, 'type' | 'status'> {
  logoUrl?: string;
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

/**
 * The redpanda block contains redpanda_common components.
 */
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
  | 'redpanda';

export type ConnectConfigObject = Record<ConnectConfigKey, unknown>;
