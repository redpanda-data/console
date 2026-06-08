/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

export type TemplateCategory = 'cdc' | 'ingest' | 'analytics' | 'migration';

export type TemplateSlotSection = 'source' | 'sink' | 'options';

type SlotBase = {
  id: string;
  label: string;
  description?: string;
  section: TemplateSlotSection;
  required?: boolean;
  /** Dotted path into the section's component schema; live schema fills unset description/required/default, slot-level values win. */
  schemaField?: string;
};

export type StringSlot = SlotBase & {
  kind: 'string';
  placeholder?: string;
  default?: string;
  multiline?: boolean;
  /** When blank but the connector still needs the key, emit this generated value instead of dropping the line. */
  defaultWhenBlank?: (ctx: { pipelineName: string }) => string;
};

export type SecretSlot = SlotBase & {
  kind: 'secret';
  suggestedName?: string;
};

export type TopicSlot = SlotBase & {
  kind: 'topic';
  default?: string;
};

export type SelectSlot = SlotBase & {
  kind: 'select';
  options: { value: string; label: string }[];
  default?: string;
};

export type TemplateSlot = StringSlot | SecretSlot | TopicSlot | SelectSlot;

export type TemplateEndpoint = {
  component: string;
  type: 'input' | 'output';
  /** Icon override for generic connector names (e.g. `sql_raw`); must be a key in `componentLogoMap`. */
  logoOverride?: string;
};

export type PipelineTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  source: TemplateEndpoint;
  sink: TemplateEndpoint;
  setupTimeMinutes: number;
  slots: TemplateSlot[];
  /** Curated YAML with `${slot.X}` placeholders; a slot has no effect unless referenced here. */
  baseYaml: string;
  defaultPipelineName: string;
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  cdc: 'CDC sources to Redpanda',
  ingest: 'Ingest sources to Redpanda',
  analytics: 'Analytics & lakehouse from Redpanda',
  migration: 'Migration & replication',
};

export const TEMPLATE_CATEGORY_ORDER: TemplateCategory[] = ['cdc', 'ingest', 'analytics', 'migration'];
