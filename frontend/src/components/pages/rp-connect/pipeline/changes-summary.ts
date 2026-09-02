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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { type PipelineFlowNode, parsePipelineFlowTree, sectionLabel } from '../utils/pipeline-flow-parser';

export type ChangeKind = 'added' | 'removed' | 'changed';

export type ComponentChange = {
  /** Positional flow-parser node id (`input-0`, `proc-1`, …). */
  id: string;
  kind: ChangeKind;
  /** Empty for a node the parser couldn't place. */
  section: string;
  label: string;
};

// Section containers are excluded; only leaf components are listed.
function componentNodesById(yaml: string): Map<string, PipelineFlowNode> {
  const byId = new Map<string, PipelineFlowNode>();
  if (!yaml.trim()) {
    return byId;
  }
  try {
    for (const node of parsePipelineFlowTree(yaml).nodes) {
      if (node.kind !== 'section') {
        byId.set(node.id, node);
      }
    }
  } catch {
    // Malformed YAML: the line diff still renders, the summary is empty.
  }
  return byId;
}

const describe = (id: string, node: PipelineFlowNode | undefined, kind: ChangeKind): ComponentChange => ({
  id,
  kind,
  section: sectionLabel(node?.section),
  label: node?.labelText ?? node?.label ?? '',
});

// `changedNodeIds` decides "changed"; this classifies added/removed by id presence.
export function summarizeComponentChanges(
  savedYaml: string,
  editedYaml: string,
  changedIds: string[]
): ComponentChange[] {
  const saved = componentNodesById(savedYaml);
  const edited = componentNodesById(editedYaml);
  const changes: ComponentChange[] = [];

  for (const id of edited.keys()) {
    if (!saved.has(id)) {
      changes.push(describe(id, edited.get(id), 'added'));
    }
  }
  for (const id of saved.keys()) {
    if (!edited.has(id)) {
      changes.push(describe(id, saved.get(id), 'removed'));
    }
  }
  for (const id of changedIds) {
    if (saved.has(id) && edited.has(id)) {
      changes.push(describe(id, edited.get(id), 'changed'));
    }
  }

  return changes.sort((a, b) => a.section.localeCompare(b.section) || a.id.localeCompare(b.id));
}

export const UNSAVED_CHANGES_LANE_LABEL = 'Unsaved changes';

export const UNSAVED_CHANGES_PILL_TOOLTIP = 'Unsaved changes — kept in this browser until you save or discard them';

export type SettingsFieldKey = 'name' | 'description' | 'computeUnits' | 'tags';

const SETTINGS_FIELDS: { key: SettingsFieldKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'computeUnits', label: 'Compute units' },
  { key: 'tags', label: 'Tags' },
];

export type SettingsValues = {
  name?: string;
  description?: string;
  computeUnits?: number;
  /** Sparse: the form's default values type a removed row as `undefined`. */
  tags?: ({ key?: string; value?: string } | undefined)[];
};

export type SettingsChange = {
  key: SettingsFieldKey;
  label: string;
  from: string;
  to: string;
};

const NOT_SET = 'not set';

// Untrimmed: trailing whitespace in a name is a real change.
function formatSettingValue(key: SettingsFieldKey, values: SettingsValues): string {
  if (key === 'computeUnits') {
    return values.computeUnits === undefined ? NOT_SET : String(values.computeUnits);
  }
  if (key === 'tags') {
    const tags = (values.tags ?? []).filter((tag) => tag?.key);
    return tags.length > 0
      ? tags.map((tag) => (tag?.value ? `${tag.key}: ${tag.value}` : tag?.key)).join(', ')
      : 'none';
  }
  return values[key] || NOT_SET;
}

// `saved` is the form's default values, re-baselined on every save. Compared by value, not `dirtyFields`.
export function summarizeSettingsChanges(saved: SettingsValues | undefined, current: SettingsValues): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const { key, label } of SETTINGS_FIELDS) {
    const from = formatSettingValue(key, saved ?? {});
    const to = formatSettingValue(key, current);
    if (from !== to) {
      changes.push({ key, label, from, to });
    }
  }
  return changes;
}

export function changesImpactMessage(state: Pipeline_State | undefined): string {
  if (state === Pipeline_State.DRAFT) {
    return "These changes aren't saved to the draft yet.";
  }
  if (state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING) {
    return 'These changes are not live. Applying them restarts the pipeline, which drops in-flight messages.';
  }
  return 'These changes are not saved to the pipeline yet.';
}

export const changesImpactTone = (state: Pipeline_State | undefined): 'info' | 'warning' =>
  state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING ? 'warning' : 'info';

export const NO_CHANGES_COPY = {
  title: 'No unsaved changes',
  body: 'The editor and settings match what is saved.',
} as const;
