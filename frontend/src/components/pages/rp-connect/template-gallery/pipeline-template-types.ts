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
};

export type StringSlot = SlotBase & {
  kind: 'string';
  placeholder?: string;
  default?: string;
  multiline?: boolean;
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
  /**
   * Optional override for the tile/section icon. Use when the connector's name
   * is generic (e.g. `sql_raw` targeting Postgres) so the gallery can still
   * show a recognizable logo. Must match a key in the connector logo map.
   */
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
  /**
   * Hand-curated YAML for the pipeline. References slot values with `${slot.X}`
   * placeholders which are substituted at deploy time (secret slots become
   * `${secrets.NAME}`; other slots are inlined as their raw values). Every
   * required slot must appear somewhere in this YAML or it has no effect on
   * the deployed pipeline.
   */
  baseYaml: string;
  /**
   * Suggested pipeline display name pre-filled in the form.
   */
  defaultPipelineName: string;
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  cdc: 'CDC sources to Redpanda',
  ingest: 'Ingest sources to Redpanda',
  analytics: 'Redpanda to analytics & lakehouse',
  migration: 'Migration & replication',
};

export const TEMPLATE_CATEGORY_ORDER: TemplateCategory[] = ['cdc', 'ingest', 'analytics', 'migration'];
